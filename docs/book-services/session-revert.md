# @opencode/SessionRevert — 会话回退服务

会话回退服务，负责将会话状态回退到指定的消息/片段位置，支持撤销回退操作，以及在确认后清理已回退的消息。

## 一、依赖层

```
SessionRevert
├── Session     — 读取/更新会话状态（revert 信息、摘要、消息）
├── Snapshot    — 快照的创建、恢复、回退（patch 级别的增量操作）
├── Storage     — 持久化会话数据
├── Bus         — 事件总线，发布同步事件
├── SessionSummary   — 重新计算/清理会话摘要
├── SessionRunState  — 校验会话忙闲状态
└── SyncEvent   — 构造同步事件，驱动前端/文件系统同步
```

## 二、核心接口

```ts
// 层定义
const layer = Layer
  .with(Session, Snapshot, Storage, Bus, SessionSummary, SessionRunState, SyncEvent)
  .define("SessionRevert", (deps) => ({
    revert:  (input: RevertInput) => Promise<void>,
    unrevert: (input: { sessionID: string }) => Promise<void>,
    cleanup:  (input: { sessionID: string }) => Promise<void>,
  }));
```

| 方法 | 签名 | 说明 |
|------|------|------|
| `revert` | `(input: RevertInput) => Promise<void>` | 将会话回退到指定消息/片段位置 |
| `unrevert` | `(input: { sessionID: string }) => Promise<void>` | 撤销上一次回退，恢复原始状态 |
| `cleanup` | `(input: { sessionID: string }) => Promise<void>` | 永久删除已回退的消息和片段 |

## 三、数据结构

### RevertInput

```ts
interface RevertInput {
  sessionID: string;    // 会话 ID
  messageID: string;    // 回退目标消息 ID
  partID?: string;      // 可选：回退到该消息内的指定片段
}
```

### RevertInfo（会话上的回退标记）

```ts
interface RevertInfo {
  messageID: string;    // 回退目标消息 ID
  partID?: string;      // 可选：回退目标片段 ID
  snapshot?: string;    // 可选：回退前保存的快照（用于 unrevert 恢复）
  diff?: string;        // 被回退消息的差异文本（用于前端展示）
}
```

## 四、方法详解

### 4.1 revert — 执行回退

**流程：**

```
revert(input)
  │
  ├─ 1. 校验会话状态
  │    SessionRunState.assertNotBusy(sessionID)
  │    确保会话不在运行中，防止并发修改
  │
  ├─ 2. 定位回退点
  │    加载所有消息 → 遍历查找目标 messageID
  │    若指定 partID → 进一步定位到消息内的目标片段
  │
  ├─ 3. 收集回退范围内的 patches
  │    收集回退点之后所有消息的快照 patches
  │    （每个 patch 记录一组增量文件变更）
  │
  ├─ 4. 处理快照
  │    若会话上存在上一次 revert 的快照 → 先恢复到该快照状态
  │    否则从快照层获取当前基准快照
  │
  ├─ 5. 逐 patch 回退
  │    for each patch in collectedPatches (逆序):
  │      Snapshot.revert(patch)
  │    将每个 patch 的变更逐一撤销
  │
  ├─ 6. 计算差异文本
  │    对回退范围内的消息提取文本 → 组装为 diff 字符串
  │    供前端展示"已回退的消息内容"
  │
  └─ 7. 更新会话
       Session.update(sessionID, {
         revert: { messageID, partID, snapshot, diff },
         summary: SessionSummary.compute(...)
       })
       写入 revert 标记 + 更新摘要
```

**关键约束：**
- 必须在会话空闲时调用（`assertNotBusy`）
- 每个 patch 回退通过 `Snapshot.revert(patch)` 执行，patch 是快照层的原子变更单元
- 保存的 `snapshot` 字段用于后续 `unrevert` 恢复

### 4.2 unrevert — 撤销回退

**流程：**

```
unrevert(input)
  │
  ├─ 1. 读取会话的 revert 信息
  │    session.revert → { snapshot?, messageID, partID }
  │
  ├─ 2. 恢复快照
  │    if (revert.snapshot exists):
  │      Snapshot.restore(revert.snapshot)
  │    将快照恢复到回退前的状态
  │
  └─ 3. 清除回退标记
       Session.update(sessionID, {
         revert: undefined,
         summary: SessionSummary.compute(...)
       })
       移除 revert 字段，重新计算摘要
```

**关键约束：**
- 仅在会话上有 `revert` 标记时才有意义
- 如果 `revert.snapshot` 不存在，仅清除标记而不操作快照
- `unrevert` 不清除消息，只恢复快照 + 移除标记

### 4.3 cleanup — 清理已回退的消息

**流程：**

```
cleanup(input)
  │
  ├─ 1. 读取会话
  │    获取所有消息 + revert 信息
  │
  ├─ 2. 删除消息
  │    找到所有位于 revert.messageID 之后的消息
  │    for each message after revert point:
  │      发布 MessageV2.Event.Removed 同步事件
  │
  ├─ 3. 删除片段（若指定 partID）
  │    在目标消息中，删除 revert.partID 及之后的片段
  │    for each part from partID onward:
  │      发布 PartRemoved 同步事件
  │
  └─ 4. 清除回退标记
       Session.update(sessionID, {
         revert: undefined,
         summary: SessionSummary.compute(...)
       })
```

**关键约束：**
- `cleanup` 是破坏性操作，删除后不可恢复（不同于 `unrevert`）
- 通过 `SyncEvent`（`MessageV2.Event.Removed`、`PartRemoved`）通知前端同步
- 执行后 `revert` 标记被清除，`unrevert` 将不再有效

## 五、生命周期状态机

```
正常状态 ──[revert()]──▶ 已回退状态
                           │
                           ├──[unrevert()]──▶ 正常状态（恢复）
                           │
                           └──[cleanup()]───▶ 正常状态（永久删除）

已回退状态标记：session.revert = { messageID, partID?, snapshot?, diff? }
```

## 六、调用关系

### 调用方（谁使用 SessionRevert）

| 调用方 | 场景 |
|--------|------|
| 前端 UI（用户点击回退按钮） | 触发 `revert` → 展示 diff → 用户确认后 `cleanup` 或 `unrevert` |
| 会话管理模块 | 自动回退场景（如出错恢复） |

### 被调用方（SessionRevert 依赖什么）

| 被调用方 | 用途 |
|----------|------|
| `SessionRunState.assertNotBusy` | 防止回退操作与会话执行冲突 |
| `Snapshot.revert` | 原子化撤销一个 patch 的文件变更 |
| `Snapshot.restore` | 恢复到指定的快照状态 |
| `Session.update` | 写入/清除 revert 信息 + 更新摘要 |
| `SessionSummary.compute` | 重新计算回退后的会话摘要 |
| `Bus.publish` | 发布同步事件驱动前端更新 |

## 七、与其他模块的协作

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  前端 UI      │────▶│ SessionRevert│────▶│   Snapshot   │
│ (revert 按钮) │     │              │     │ (文件回退)    │
└──────────────┘     │              │     └──────────────┘
                     │              │
┌──────────────┐     │              │     ┌──────────────┐
│   Session     │◀───▶│              │────▶│     Bus      │
│ (状态管理)    │     └──────────────┘     │ (事件同步)    │
└──────────────┘                          └──────────────┘
```

## 八、边界情况

| 场景 | 行为 |
|------|------|
| 回退时会话正忙 | `assertNotBusy` 抛出异常，操作被拒绝 |
| 回退到第一条消息 | 所有 patches 被收集，所有消息被回退 |
| 回退点不存在 | 遍历消息时找不到目标 messageID，操作失败 |
| 重复回退 | 新的 revert 覆盖旧的 revert 信息（先恢复旧快照，再执行新回退） |
| unrevert 时无快照 | 仅清除 revert 标记，不操作快照层 |
| cleanup 后 unrevert | 不可行 — cleanup 已清除 revert 标记 |
| 指定 partID 回退 | 回退到消息内的指定片段位置，消息本身保留（仅移除后续片段） |

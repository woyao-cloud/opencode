# @opencode/SessionSummary — 会话变更摘要服务

## 概述

`@opencode/SessionSummary` 是 OpenCode 的**会话变更摘要服务**，负责计算会话中代码变更的差异（diff），并将结果持久化存储。它通过遍历会话消息中的快照（snapshot）信息，计算从 step-start 到 step-finish 的完整文件差异，最终汇总为会话级别的变更摘要（新增、删除、文件列表），并通过 Bus 发布 Diff 事件通知其他模块。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Session` | `@opencode/Session` | 会话数据访问，读取消息列表和会话摘要 |
| `Snapshot` | `@opencode/Snapshot` | 快照服务，计算两个快照之间的完整文件差异 |
| `Storage` | `@opencode/Storage` | 持久化存储，读取和写入 diff 数据 |
| `Bus` | `@opencode/Bus` | 事件总线，发布 `Session.Event.Diff` 事件 |

```typescript
// summary.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const session = yield* Session.Service       // 会话数据
  const snapshot = yield* Snapshot.Service     // 快照差异计算
  const storage = yield* Storage.Service       // diff 持久化
  const bus = yield* Bus.Service              // 事件发布
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(Session.defaultLayer),
  Layer.provide(Snapshot.defaultLayer),
  Layer.provide(Storage.defaultLayer),
  Layer.provide(Bus.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly summarize: (input: DiffInput) => Effect.Effect<void>
  readonly diff: (input: DiffInput) => Effect.Effect<string>
  readonly computeDiff: (input: DiffInput) => Effect.Effect<string>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionSummary") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 计算并持久化会话摘要
yield* SessionSummary.Service.summarize({ sessionID: "abc123" })

// 读取已持久化的 diff
const diffText = yield* SessionSummary.Service.diff({ sessionID: "abc123" })

// 仅计算 diff（不持久化）
const diffText = yield* SessionSummary.Service.computeDiff({ sessionID: "abc123" })
```

## 数据结构

### DiffInput

```typescript
interface DiffInput {
  sessionID: string
  messageID?: string  // 可选，指定特定消息（用于单消息 diff）
}
```

### Session.Summary（会话摘要）

`summarize` 方法会将计算结果写入会话的 Summary 字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `additions` | `number` | 新增行数 |
| `deletions` | `number` | 删除行数 |
| `files` | `number` | 变更文件数 |

## 核心流程

### summarize — 计算并持久化会话摘要

```
summarize({ sessionID })
  ├── 1. 读取会话的所有消息
  ├── 2. 遍历消息，找到所有包含快照信息的消息
  │     ├── step-start 快照（任务开始前的文件状态）
  │     └── step-finish 快照（任务完成后的文件状态）
  ├── 3. 对每个 step-start/step-finish 对：
  │     └── 调用 computeDiff 计算差异
  ├── 4. 汇总所有差异：
  │     ├── additions（新增行数总计）
  │     ├── deletions（删除行数总计）
  │     └── files（变更文件数）
  ├── 5. 更新 session.summary 字段
  ├── 6. 持久化 diff 文本到 Storage
  ├── 7. 发布 Session.Event.Diff 事件（通过 Bus）
  └── 8. 对用户消息（user role）单独计算 per-message diff
        └── 将结果存入消息的 info 字段
```

### computeDiff — 计算完整差异

```
computeDiff({ sessionID })
  ├── 1. 读取会话的所有消息
  ├── 2. 找到最早的 step-start 快照
  │     └── 遍历消息，提取 step-start 中的快照引用
  ├── 3. 找到最晚的 step-finish 快照
  │     └── 遍历消息，提取 step-finish 中的快照引用
  ├── 4. 调用 snapshot.diffFull(earliest, latest)
  │     └── 计算两个快照之间的完整文件差异
  └── 5. 返回 git diff 格式的文本
```

### diff — 读取已持久化的 diff

```
diff({ sessionID })
  ├── 1. 从 Storage 读取持久化的 diff 数据
  ├── 2. 对 diff 输出中的 git 引用路径进行反转义
  │     └── unquoteGitPath() 处理 C 风格转义和八进制序列
  └── 3. 返回可读的 diff 文本
```

## 关键函数详解

### unquoteGitPath

解析 git diff 输出中被引号包裹的文件路径。Git 在文件名包含特殊字符时使用 C 风格的引号格式，例如 `"path\\303\\251"` 表示 `pathé`。

**支持的转义序列**：

| 转义 | 说明 | 示例 |
|------|------|------|
| `\\n` | 换行符 | |
| `\\t` | 制表符 | |
| `\\\"` | 双引号 | |
| `\\\\` | 反斜杠 | |
| `\\NNN` | 八进制字节序列（3 位） | `\\303\\251` → `é` |

```typescript
function unquoteGitPath(quoted: string): string
```

## 关键设计决策

1. **快照对匹配**：通过消息中的 step-start 和 step-finish 标记配对，计算每个任务步骤的文件变更，确保 diff 精确反映单次操作的代码改动

2. **分层 diff 存储**：完整 diff 文本持久化到 Storage（供后续查阅），摘要信息（additions/deletions/files）存入 Session.Summary（供快速展示），避免每次渲染都解析完整 diff

3. **per-message diff**：除了会话级别的汇总 diff，还对每条用户消息单独计算 diff 并附加到消息的 info 字段，支持在对话界面中按消息粒度展示变更

4. **Git 路径反转义**：`unquoteGitPath` 专门处理 git diff 输出中的 C 风格转义路径，包括多字节 UTF-8 字符的八进制序列表示，确保中文等非 ASCII 文件名正确显示

5. **事件驱动通知**：summarize 完成后通过 Bus 发布 `Session.Event.Diff` 事件，允许 UI 等其他模块订阅并实时更新展示，解耦摘要计算与界面渲染

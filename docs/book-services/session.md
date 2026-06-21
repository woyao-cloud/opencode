# @opencode/Session — 会话管理服务

## 概述

`@opencode/Session` 是 OpenCode 的**会话生命周期管理服务**，负责创建、查询、更新、归档、删除和 fork 会话。它基于 Effect 框架实现，使用 SQLite（Drizzle ORM）持久化会话数据和消息，对外暴露为 Effect Service。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `BackgroundJob` | `@opencode/BackgroundJob` | 后台任务管理，删除会话时取消关联的后台任务 |
| `Bus` | `@opencode-ai/core/bus` | 事件总线，发布 `Created`、`Updated`、`Deleted` 等会话事件 |
| `Storage` | `@opencode-ai/core/storage` | 持久化存储抽象层 |
| `SyncEvent` | `@opencode-ai/core/sync` | 同步事件系统，通过 patch 机制增量更新会话数据 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 运行时标志，控制行为开关 |

```typescript
// session.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bg = yield* BackgroundJob.Service   // 后台任务管理
  const bus = yield* Bus.Service             // 事件发布
  const storage = yield* Storage.Service     // 持久化存储
  const sync = yield* SyncEvent.Service      // 同步事件
  const flags = yield* RuntimeFlags.Service  // 运行时标志
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(BackgroundJob.defaultLayer),
  Layer.provide(Bus.defaultLayer),
  Layer.provide(Storage.defaultLayer),
  Layer.provide(SyncEvent.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly list: (input: ListInput) => Effect.Effect<Info[]>
  readonly create: (input: CreateInput) => Effect.Effect<Info>
  readonly fork: (input: ForkInput) => Effect.Effect<Info>
  readonly touch: (id: string) => Effect.Effect<void>
  readonly get: (id: string) => Effect.Effect<Info>
  readonly setTitle: (id: string, title: string) => Effect.Effect<void>
  readonly setArchived: (id: string, archived: boolean) => Effect.Effect<void>
  readonly setPermission: (id: string, permission: Permission) => Effect.Effect<void>
  readonly setRevert: (id: string, revert: Revert) => Effect.Effect<void>
  readonly clearRevert: (id: string) => Effect.Effect<void>
  readonly setSummary: (id: string, summary: Summary) => Effect.Effect<void>
  readonly diff: (id: string) => Effect.Effect<string>
  readonly messages: (id: string) => Effect.Effect<MessageInfo[]>
  readonly children: (id: string) => Effect.Effect<Info[]>
  readonly remove: (id: string) => Effect.Effect<void>
  readonly updateMessage: (input: UpdateMessageInput) => Effect.Effect<void>
  readonly removeMessage: (input: RemoveMessageInput) => Effect.Effect<void>
  readonly removePart: (input: RemovePartInput) => Effect.Effect<void>
  readonly updatePart: (input: UpdatePartInput) => Effect.Effect<void>
  readonly getPart: (input: GetPartInput) => Effect.Effect<Part>
  readonly updatePartDelta: (input: UpdatePartDeltaInput) => Effect.Effect<void>
  readonly findMessage: (input: FindMessageInput) => Effect.Effect<MessageInfo | undefined>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Session") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取会话列表
yield* Session.Service.list({ projectID: "proj_xxx" })

// 创建新会话
yield* Session.Service.create({ projectID: "proj_xxx", workspaceID: "ws_xxx" })

// 删除会话
yield* Session.Service.remove("session_xxx")
```

## 会话数据结构

### Info（会话信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 会话唯一 ID，使用 ULID 生成 |
| `slug` | `string` | 会话短标识符 |
| `projectID` | `string` | 所属项目 ID |
| `workspaceID` | `string` | 所属工作空间 ID |
| `directory` | `string` | 会话工作目录 |
| `path` | `string` | 会话路径 |
| `parentID` | `string?` | 父会话 ID（fork 或子会话时设置） |
| `summary` | `Summary?` | 会话摘要信息 |
| `cost` | `number` | 会话消耗的 token 费用 |
| `tokens` | `Tokens` | token 用量统计 |
| `share` | `Share?` | 分享配置 |
| `title` | `string` | 会话标题 |
| `agent` | `string?` | 使用的 Agent 名称 |
| `model` | `Model` | 使用的模型信息 |
| `version` | `string` | OpenCode 版本号 |
| `time` | `Time` | 时间戳信息（创建、更新） |
| `permission` | `Permission?` | 权限设置 |
| `revert` | `Revert?` | 回退信息 |

### 辅助类型

| 类型 | 字段 | 说明 |
|------|------|------|
| `Summary` | `title`, `content`, `tokens` | 会话摘要 |
| `Tokens` | `input`, `output`, `cache`, `reasoning` | token 用量分项统计 |
| `Share` | `url`, `time` | 分享链接和分享时间 |
| `Time` | `created`, `updated` | 创建和更新时间戳 |
| `Revert` | `messageID`, `partID` | 回退目标（消息 ID + Part ID） |
| `Model` | `providerID`, `modelID` | 模型 Provider 和模型 ID |

### 输入类型

| 类型 | 关键字段 | 说明 |
|------|----------|------|
| `CreateInput` | `projectID`, `workspaceID`, `parentID?`, `directory?`, `agent?`, `model?` | 创建会话参数 |
| `ForkInput` | `sessionID`, `messageID` | Fork 会话参数，复制到指定消息为止 |
| `ListInput` | `projectID?`, `workspaceID?` | 列表查询过滤条件 |
| `UpdateMessageInput` | `sessionID`, `messageID`, `partID`, `delta` | 更新消息 Part |
| `RemoveMessageInput` | `sessionID`, `messageID` | 删除消息 |
| `RemovePartInput` | `sessionID`, `messageID`, `partID` | 删除消息 Part |
| `UpdatePartInput` | `sessionID`, `messageID`, `partID`, `data` | 完整替换 Part |
| `GetPartInput` | `sessionID`, `messageID`, `partID` | 获取单个 Part |
| `UpdatePartDeltaInput` | `sessionID`, `messageID`, `partID`, `delta` | 增量更新 Part |
| `FindMessageInput` | `sessionID`, `messageID` | 查找消息 |

## 会话生命周期

### 创建 (create)

```
create(input)
  ├── 1. 生成 ULID（降序，便于按时间排序）
  ├── 2. 生成 slug（ULID 的简短形式）
  ├── 3. 确定默认标题
  │     ├── parentID 存在 → "Child session - {ISO 日期}"
  │     └── 无父会话 → "New session - {ISO 日期}"
  ├── 4. 写入 SQLite 数据库
  ├── 5. 发布 SyncEvent.Created
  └── 6. 返回 Info
```

### Fork (fork)

```
fork(input)
  ├── 1. 读取源会话（get）
  ├── 2. 读取源会话的所有消息（messages）
  ├── 3. 截取消息列表到指定 messageID
  ├── 4. 以源会话信息为模板创建新会话（create）
  ├── 5. 将截取的消息批量写入新会话
  └── 6. 返回新会话的 Info
```

### 查询

- **list**：按 `projectID` 或 `workspaceID` 过滤会话列表，按创建时间降序排列
- **listByProject**：查询指定项目下所有会话
- **listGlobal**：查询全局会话（无 projectID 绑定的会话）
- **get**：根据 ID 获取单个会话详情
- **children**：获取指定会话的所有子会话（`parentID` 匹配）
- **messages**：获取会话的所有消息列表
- **findMessage**：查找特定消息是否存在

### 更新

- **setTitle**：更新会话标题
- **setArchived**：归档/取消归档会话
- **setPermission**：设置会话权限
- **setRevert / clearRevert**：设置/清除回退目标
- **setSummary**：设置会话摘要（标题、内容、token 用量）
- **touch**：更新会话的 `updated` 时间戳
- **updateMessage**：更新指定消息的 Part
- **removeMessage**：删除指定消息
- **removePart**：删除消息的指定 Part
- **updatePart**：完整替换 Part 内容
- **getPart**：获取单个 Part 详情
- **updatePartDelta**：增量更新 Part（delta 合并）

### 删除 (remove)

```
remove(id)
  ├── 1. 查找所有子会话（parentID = id）
  ├── 2. 递归删除所有子会话
  ├── 3. 取消该会话关联的所有 BackgroundJob
  ├── 4. 从数据库删除会话记录
  └── 5. 发布 SyncEvent.Deleted
```

### 获取用量 (getUsage)

根据会话关联的模型和 provider 定价层级计算 token 费用：

```
getUsage(session)
  ├── 1. 获取会话的 model 信息
  ├── 2. 查找对应 provider 的定价配置
  ├── 3. 计算 input / output / cache / reasoning token 费用
  └── 4. 返回 cost 数值
```

## Patch 更新机制

会话的数据变更通过 `SyncEvent` 系统的 patch 机制实现增量更新：

```typescript
// 更新会话标题时，生成 patch 并发布 SyncEvent.Updated
const patch = { title: newTitle }
yield* sync.publish(SyncEvent.Updated({ sessionID: id, patch }))
```

这种设计确保：
- 多个客户端可以同步会话状态变更
- 变更以增量 patch 形式传播，而非全量替换
- 冲突可以通过 patch 粒度和版本号来管理

## 事件系统

| 事件 | 触发时机 | 载荷 |
|------|----------|------|
| `SyncEvent.Created` | 新会话创建 | `Info` |
| `SyncEvent.Updated` | 会话属性变更 | `{ sessionID, patch }` |
| `SyncEvent.Deleted` | 会话删除 | `sessionID` |
| `BusEvent.Diff` | 请求会话 diff | `string`（diff 内容） |
| `BusEvent.Error` | 操作异常 | 错误信息 |

## ID 生成策略

会话 ID 使用 ULID 格式，具有以下特性：

- **降序排列**：新创建的会话 ID 按字典序排在前面，便于 SQLite 按 ID 降序查询时自然得到最新会话
- **唯一性**：ULID 结合了时间戳和随机数，保证全局唯一
- **可排序**：字典序与创建时间序一致

```typescript
// 降序 ULID 生成
const id = ULID.descending()
```

## 子模块概览

| 模块 | 文件 | 功能 |
|------|------|------|
| `Session` | `session.ts` | 主服务，会话生命周期管理 |
| `MessageInfo` | `message.ts` | 消息数据结构和类型定义 |
| `Part` | `part.ts` | 消息 Part 类型（文本、工具调用、工具结果等） |

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有会话操作都通过 Effect 生成器，天然支持并发、错误处理和资源管理

2. **ULID 降序 ID**：使用降序 ULID 作为主键，利用 SQLite B-tree 索引的字典序特性，使 `ORDER BY id DESC` 查询天然返回最新会话，无需额外的创建时间索引

3. **级联删除**：删除会话时递归删除所有子会话，同时取消关联的后台任务，避免孤儿数据

4. **Patch 同步**：会话变更通过 SyncEvent 的 patch 机制传播，支持多客户端协同场景，变更粒度精细到字段级别

5. **Fork 消息截取**：Fork 操作复制源会话到指定消息为止的所有消息，支持从任意历史节点分支，实现对话回溯

6. **模型定价集成**：getUsage 根据实际使用的 model 和 provider 定价层级计算费用，而非使用固定费率

7. **消息存储分离**：会话元数据和消息内容分离存储，消息通过 Part 粒度管理（文本、工具调用、工具结果），支持增量更新和精细控制

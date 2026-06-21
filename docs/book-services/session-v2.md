# @opencode/v2/Session — V2 会话服务（新版事件驱动架构）

## 概述

`@opencode/v2/Session` 是 OpenCode v2 的**会话管理服务**，负责创建、查询、管理 AI 对话会话的完整生命周期。它基于 Effect 框架实现，采用新版事件驱动架构，通过 `EventV2Bridge` 发布会话事件。该服务与 v1 的 `SessionTable` 和 `SessionMessageTable` 共享底层持久化存储，但在 API 层面做了重新设计：引入 cursor-based 分页、Delivery 模式（immediate/deferred）、以及子会话（subagent）管理等新能力。

### 依赖的 Services

| Service | 用途 |
|---|---|
| `EventV2Bridge` | 事件桥接，发布 `SessionEvent.AgentSwitched`、`SessionEvent.ModelSwitched` 等会话变更事件 |

```typescript
// session.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const eventBridge = yield* EventV2Bridge.Service
  return new Service(eventBridge)
}))

export const defaultLayer = layer.pipe(
  Layer.provide(EventV2Bridge.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly create: (input: {
    parentID?: string
    path: string
    agent?: string
    model?: { providerID: string; modelID: string }
    title?: string
  }) => Effect.Effect<Info>

  readonly get: (id: string) => Effect.Effect<Info>

  readonly list: (input?: {
    directory?: string
    path?: string
    workspaceID?: string
    roots?: string[]
    start?: string
    search?: string
    direction?: "previous" | "next"
    limit?: number
  }) => Effect.Effect<Info[]>

  readonly messages: (input: {
    sessionID: string
    direction?: "previous" | "next"
    limit?: number
  }) => Effect.Effect<SessionMessage.Message[]>

  readonly context: (input: { sessionID: string }) => Effect.Effect<SessionMessage.Message[]>

  readonly prompt: (input: {
    sessionID: string
    message: SessionMessage.User
    agent?: string
    model?: { providerID: string; modelID: string }
    delivery?: Delivery
  }) => Effect.Effect<void>

  readonly shell: (input: {
    sessionID: string
    command: string
    agent?: string
    model?: { providerID: string; modelID: string }
    delivery?: Delivery
  }) => Effect.Effect<void>

  readonly skill: (input: {
    sessionID: string
    command: string
    agent?: string
    model?: { providerID: string; modelID: string }
    delivery?: Delivery
  }) => Effect.Effect<void>

  readonly subagent: (input: {
    sessionID: string
    agent: string
    model?: { providerID: string; modelID: string }
    description: string
    prompt: string
    delivery?: Delivery
  }) => Effect.Effect<void>

  readonly switchAgent: (input: {
    sessionID: string
    agent: string
  }) => Effect.Effect<void>

  readonly switchModel: (input: {
    sessionID: string
    model: { providerID: string; modelID: string }
  }) => Effect.Effect<void>

  readonly compact: (input: {
    sessionID: string
    agent?: string
    model?: { providerID: string; modelID: string }
  }) => Effect.Effect<void>

  readonly wait: (input: { sessionID: string }) => Effect.Effect<void>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Session") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取会话列表
yield* Session.Service.list({ directory: "/path/to/project" })

// 创建会话
yield* Session.Service.create({ path: "/path/to/project", agent: "code" })

// 获取会话消息
yield* Session.Service.messages({ sessionID: "session_xxx", limit: 50 })
```

## 数据结构

### Info（会话信息）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 会话唯一标识 |
| `parentID` | `string?` | 父会话 ID（子会话/subagent 场景） |
| `projectID` | `string?` | 所属项目 ID |
| `workspaceID` | `string?` | 所属工作空间 ID |
| `path` | `string?` | 会话关联的文件系统路径 |
| `agent` | `string?` | 当前使用的 agent 名称 |
| `model` | `{ providerID: string; modelID: string }?` | 当前使用的模型 |
| `cost` | `number?` | 会话累计费用 |
| `tokens` | `number?` | 会话累计 token 数 |
| `time` | `{ created: DateTime.Utc; updated: DateTime.Utc }?` | 创建/更新时间 |
| `title` | `string?` | 会话标题 |

注释中标注了计划新增的字段（尚未启用）：

| 计划字段 | 类型 | 说明 |
|------|------|------|
| `slug` | `string?` | 会话短标识 |
| `directory` | `string?` | 会话所在目录 |
| `summary` | `string?` | 会话摘要 |
| `share` | `string?` | 分享状态 |
| `version` | `string?` | 会话版本 |
| `permission` | `object?` | 权限配置 |
| `revert` | `object?` | 回退信息 |

### Delivery（消息投递模式）

```typescript
export enum Delivery {
  Immediate = "immediate",  // 立即投递（默认）
  Deferred = "deferred",    // 延迟投递
}
```

控制 `prompt`、`shell`、`skill`、`subagent` 等操作的执行时机。

### NotFoundError

```typescript
export class NotFoundError extends Error {
  constructor(id: string) {
    super(`Session not found: ${id}`)
  }
}
```

当 `get()` 查询不存在的会话时抛出。

## 关键实现细节

### create — 会话创建

当前为 **stub 实现**，直接返回 `{} as any`。未来将实现：生成唯一 ID、写入 `SessionTable`、发布创建事件。

### get — 单会话查询

```typescript
get(id: string): Effect.Effect<Info>
```

从 `SessionTable` 查询单条记录，通过 `fromRow()` 将数据库行转换为 `Info` 实例。若查询结果为空则抛出 `NotFoundError`。

### list — 会话列表（cursor-based 分页）

```typescript
list(input?: {
  directory?: string       // 按目录筛选
  path?: string            // 按路径筛选
  workspaceID?: string     // 按工作空间筛选
  roots?: string[]         // 按多个根路径筛选
  start?: string           // 游标起始位置（会话 ID）
  search?: string          // 搜索关键词
  direction?: "previous" | "next"  // 分页方向（默认 next）
  limit?: number           // 返回数量上限
}): Effect.Effect<Info[]>
```

支持多维度筛选和 cursor-based 分页：
- 可按 `directory`、`path`、`workspaceID`、`roots` 任意组合筛选
- `start` 参数作为游标，配合 `direction` 实现向前/向后翻页
- `search` 支持按标题模糊搜索
- 查询结果通过 `fromRow()` 统一转换为 `Info` 实例

### messages — 消息列表（cursor-based 分页）

```typescript
messages(input: {
  sessionID: string
  direction?: "previous" | "next"
  limit?: number
}): Effect.Effect<SessionMessage.Message[]>
```

从 `SessionMessageTable` 查询指定会话的消息记录，支持 cursor-based 分页。每条记录使用 `SessionMessage.Message` schema 解码。

### context — 上下文消息

```typescript
context(input: { sessionID: string }): Effect.Effect<SessionMessage.Message[]>
```

返回自**最后一次压缩（compaction）消息**以来的所有消息。实现逻辑：通过 `time_created` 字段比较，找到最近一条 compaction 消息的时间戳，返回该时间之后的所有消息。这使得 AI 模型能获取压缩后的精简上下文。

### prompt — 用户消息投递

当前为 **stub 实现**（`return {} as any`）。未来将实现：将 `SessionMessage.User` 写入 `SessionMessageTable`，根据 `delivery` 模式决定立即或延迟触发 AI 响应。

### shell — Shell 命令执行

当前为 **stub 实现**（`return {} as any`）。未来将实现：在会话上下文中执行 shell 命令，并可选指定 agent/model。

### skill — 技能命令执行

当前为 **stub 实现**（`return {} as any`）。未来将实现：在会话上下文中执行自定义技能命令。

### subagent — 子代理执行

```typescript
subagent(input: {
  sessionID: string
  agent: string
  model?: { providerID: string; modelID: string }
  description: string
  prompt: string
  delivery?: Delivery
}): Effect.Effect<void>
```

完整实现流程：
1. 创建子会话（`create` with `parentID` 指向当前会话）
2. 向子会话投递 prompt（`prompt`）
3. `fork` 一个子 fiber 等待子会话完成，提取响应文本

### switchAgent — 切换 Agent

```typescript
switchAgent(input: { sessionID: string; agent: string }): Effect.Effect<void>
```

发布 `SessionEvent.AgentSwitched` 事件，通知系统中其他组件当前会话的 agent 已变更。

### switchModel — 切换模型

```typescript
switchModel(input: {
  sessionID: string
  model: { providerID: string; modelID: string }
}): Effect.Effect<void>
```

发布 `SessionEvent.ModelSwitched` 事件，通知系统中其他组件当前会话的模型已变更。

### compact — 上下文压缩

当前为 **stub 实现**（`return {} as any`）。未来将实现：触发会话上下文压缩，将历史消息总结为摘要，减少 token 消耗。

### wait — 等待会话完成

当前为 **stub 实现**（`return {} as any`）。未来将实现：阻塞等待指定会话的所有待处理操作完成。

### fromRow — 数据库行映射

```typescript
function fromRow(row: SessionTable.Row): Info
```

将 `SessionTable` 的原始行数据转换为 `Info` 实例：
- 时间戳字段（`time_created`、`time_updated`）转换为 `DateTime.Utc` 类型
- 其他字段直接映射到 `Info` 对应属性

## 关键设计决策

1. **v1/v2 共享存储层**：使用与 v1 相同的 `SessionTable` 和 `SessionMessageTable`，避免数据迁移成本，v2 仅重新设计 API 层

2. **事件驱动架构**：agent/model 切换通过发布 `SessionEvent` 事件实现，解耦了状态变更与副作用处理，由 `EventV2Bridge` 负责事件分发

3. **Cursor-based 分页**：`list()` 和 `messages()` 均采用 cursor-based 分页（`start` + `direction`），相比 offset-based 分页更适合实时追加的消息流场景

4. **Delivery 模式**：引入 `immediate` / `deferred` 两种投递模式，为未来的异步任务调度预留扩展空间

5. **子会话（Subagent）模式**：`subagent()` 通过创建子会话 + fork 子 fiber 的方式实现，子会话独立拥有自己的消息历史和上下文，父会话通过等待子 fiber 完成来获取结果

6. **渐进式实现**：`create`、`prompt`、`shell`、`skill`、`compact`、`wait` 等核心方法当前均为 stub，采用渐进式开发策略，先完成查询能力（get/list/messages/context），再逐步实现写入和操作能力

7. **上下文压缩感知**：`context()` 方法识别 compaction 消息边界，只返回压缩后的有效上下文，避免将冗余历史传递给 AI 模型

# @opencode/SessionProcessor — 会话流处理器

## 概述

`@opencode/SessionProcessor` 是 OpenCode 的**会话流处理器**，负责消费单条 Assistant 消息的 LLM 流式响应，解析其中的推理、文本、工具调用等事件，并驱动整个消息生命周期——从流开始到最终完成（compact / stop / continue）。它基于 Effect 框架实现，对外暴露为 Effect Service。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Session` | `@opencode/Session` | 会话数据读写，获取会话状态、消息历史、工具调用 |
| `Config` | `@opencode/Config` | 配置服务，读取 compaction、permission 等运行时配置 |
| `Bus` | `@opencode-ai/core/bus` | 事件总线，广播 SessionEvent（Step、Reasoning、Tool、Text、Retried） |
| `Snapshot` | `@opencode/Snapshot` | 快照服务，捕获流开始前的文件快照，计算完成后的 patch |
| `Agent` | `@opencode/Agent` | Agent 定义服务，获取当前 agent 的配置（工具列表、系统提示等） |
| `LLM` | `@opencode-ai/core/llm` | LLM 流式接口，`StreamInput` / `StreamOutput` 类型 |
| `Permission` | `@opencode/Permission` | 权限服务，检测工具调用是否需要用户授权 |
| `Plugin` | `@opencode/Plugin` | 插件服务，为工具调用提供插件上下文 |
| `SessionSummary` | `@opencode/SessionSummary` | 会话摘要服务，在 compaction 前生成历史摘要 |
| `SessionStatus` | `@opencode/SessionStatus` | 会话状态管理，更新当前处理状态（running / completed / error） |
| `Image` | `@opencode-ai/core/image` | 图片处理服务，对工具结果中的附件进行规范化 |
| `EventV2Bridge` | `@opencode/EventV2Bridge` | 事件桥接，将内部事件双写到实验性事件系统 |
| `RuntimeFlags` | `@opencode-ai/core/runtime-flags` | 运行时标志，控制实验性功能开关 |

```typescript
// processor.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const sessionSvc = yield* Session.Service        // 会话读写
  const configSvc = yield* Config.Service           // 配置
  const bus = yield* Bus.Service                    // 事件广播
  const snapshotSvc = yield* Snapshot.Service       // 快照捕获
  const agentSvc = yield* Agent.Service             // Agent 定义
  const llmSvc = yield* LLM.Service                 // LLM 流
  const permissionSvc = yield* Permission.Service   // 权限检测
  const pluginSvc = yield* Plugin.Service           // 插件上下文
  const summarySvc = yield* SessionSummary.Service  // 摘要生成
  const statusSvc = yield* SessionStatus.Service    // 状态更新
  const imageSvc = yield* Image.Service             // 图片规范化
  const eventBridge = yield* EventV2Bridge.Service  // 事件双写
  const flags = yield* RuntimeFlags.Service         // 运行时标志
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(Session.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Bus.defaultLayer),
  Layer.provide(Snapshot.defaultLayer),
  Layer.provide(Agent.defaultLayer),
  Layer.provide(LLM.defaultLayer),
  Layer.provide(Permission.defaultLayer),
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(SessionSummary.defaultLayer),
  Layer.provide(SessionStatus.defaultLayer),
  Layer.provide(Image.defaultLayer),
  Layer.provide(EventV2Bridge.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly create: (message: Message) => Effect.Effect<Handle>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionProcessor") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 创建处理器
const handle = yield* SessionProcessor.Service.create(assistantMessage)

// 处理流
const result = yield* handle.process(streamInput)
```

## Handle 接口

```typescript
export interface Handle {
  readonly message: Message                           // 当前 Assistant 消息
  readonly updateToolCall: (input: UpdateToolCallInput) => Effect.Effect<void>
  readonly completeToolCall: (input: CompleteToolCallInput) => Effect.Effect<void>
  readonly process: (input: LLM.StreamInput) => Effect.Effect<Result>
}
```

| 方法 | 说明 |
|------|------|
| `message` | 当前正在处理的 Assistant 消息引用 |
| `updateToolCall` | 更新工具调用的参数（用于用户编辑后重新提交） |
| `completeToolCall` | 完成一个工具调用（用于用户直接完成工具结果） |
| `process` | 消费 LLM 流，返回处理结果 |

## 处理结果 (Result)

```typescript
export type Result = "compact" | "stop" | "continue"
```

| 值 | 触发条件 |
|----|----------|
| `"compact"` | 上下文溢出（`isOverflow`），需要触发 compaction 后继续 |
| `"stop"` | 权限请求被阻止（`blocked`），或用户需要交互 |
| `"continue"` | 流正常完成，可以继续下一轮对话 |

## 关键数据结构

### ProcessorContext

处理器在流处理期间维护的内部上下文：

| 字段 | 类型 | 说明 |
|------|------|------|
| `toolcalls` | `Map<string, ToolCall>` | 活跃的工具调用映射（key = partID） |
| `shouldBreak` | `boolean` | 是否需要中断处理循环 |
| `snapshot` | `Snapshot.State?` | 流开始前的文件系统快照 |
| `blocked` | `boolean` | 是否有权限请求被阻止 |
| `needsCompaction` | `boolean` | 是否需要在处理完成后执行 compaction |
| `currentText` | `TextPart?` | 当前正在构建的文本 Part |
| `reasoningMap` | `Map<string, ReasoningPart>` | 推理内容的 partID 映射 |

### ToolCall

工具调用的生命周期状态：

| 字段 | 类型 | 说明 |
|------|------|------|
| `partID` | `string` | 工具调用 Part 的唯一标识 |
| `messageID` | `string` | 所属消息的 ID |
| `sessionID` | `string` | 所属会话的 ID |
| `done` | `boolean` | 工具调用是否已完成（成功或失败） |

工具调用状态流转：`pending → running → completed` 或 `pending → running → error`，支持延迟结算（deferred settlement）。

## 流事件处理

`process()` 通过 `Stream.tap` 订阅 LLM 流的所有事件，按类型分发处理：

### 事件类型一览

| 事件类型 | 处理逻辑 |
|----------|----------|
| `start` | 捕获快照（`Snapshot.capture`），初始化上下文 |
| `reasoning-start` | 创建 `ReasoningPart`，记录到 `reasoningMap` |
| `reasoning-delta` | 追加推理文本增量 |
| `reasoning-end` | 标记推理 Part 完成 |
| `tool-input-start` | 创建 `ToolPart`，加入 `toolcalls` 映射 |
| `tool-input-delta` | 追加工具输入参数 JSON |
| `tool-input-end` | 完成工具输入构建，触发权限检测 |
| `tool-call` | 设置 `shouldBreak`，暂停流以执行工具 |
| `tool-result` | 处理工具执行结果，进行图片规范化 |
| `tool-error` | 处理工具执行错误 |
| `start-step` | 开始新的消息 step |
| `finish-step` | 完成 step：计算快照 patch、检测 `isOverflow`、检查 doom loop |
| `text-start` | 创建 `TextPart`，设置 `currentText` |
| `text-delta` | 追加文本增量 |
| `text-end` | 完成文本 Part |
| `finish` | 流正常结束，触发 cleanup |
| `error` | 流异常终止，触发 cleanup |

## 核心机制

### Doom Loop 检测

当同一个工具调用以相同的输入连续重复执行时，可能陷入死循环。处理器通过以下机制检测：

```typescript
const DOOM_LOOP_THRESHOLD = 3
```

当同一工具调用在消息历史中连续出现 >= 3 次且输入相同时，触发权限询问（`Permission.ask`），让用户决定是否继续。

### 快照追踪

1. **流开始时**（`start` 事件）：调用 `Snapshot.capture()` 捕获当前文件系统状态
2. **每个 step 完成时**（`finish-step` 事件）：计算 `Snapshot.patch(before, after)`，得到该 step 的文件变更 diff
3. 快照 patch 作为 `SessionEvent.Step` 的一部分广播到事件总线

### 工具调用生命周期

```
                    ┌──────────┐
    tool-input-start│  pending │
         ·          └────┬─────┘
         ·               │ tool-call
    tool-input-end       ▼
                    ┌──────────┐
                    │  running │
                    └────┬─────┘
                    ┌────┴─────┐
               success       error
                    │          │
                    ▼          ▼
              ┌─────────┐ ┌───────┐
              │completed│ │ error │
              └─────────┘ └───────┘
```

- **延迟结算**：工具调用完成后，结果可能不是立即可用的，处理器通过 `updateToolCall` 和 `completeToolCall` 支持异步完成
- **权限门控**：在 `tool-input-end` 阶段检查权限，若被阻止则返回 `"stop"`

### Retry 策略

通过 `SessionRetry` 处理 LLM 流的瞬时故障：

- 在 `finish-step` 事件中捕获可重试的错误
- 自动重建 LLM 流并重新进入处理循环
- 重试次数受配置控制

### Compaction 检测

在每个 `finish-step` 事件中检查 `isOverflow` 标志：

- 如果上下文使用量超过阈值 → 设置 `needsCompaction = true`
- 流结束后返回 `"compact"` 结果，由上层触发 `SessionSummary.compact()` 并重新开始处理

### 图片规范化

工具执行结果（`tool-result`）中的附件（如截图、图片文件）通过 `Image` 服务进行规范化：

- 格式转换（如需要）
- 尺寸调整
- 元数据提取

### 事件系统双写

处理器同时向两个事件系统写入事件：

1. **主事件总线**（`Bus.Service`）：通过 `SessionEvent` 发布 Step、Reasoning、Tool、Text、Retried 等事件
2. **实验性事件系统**（`EventV2Bridge`）：并行写入，用于新架构的灰度验证

### Cleanup

流结束时（`finish` 或 `error`），处理器执行清理：

1. **未完成的文本 Part**：如果有未闭合的 `currentText`，将其最终化
2. **未完成的推理 Part**：遍历 `reasoningMap`，关闭所有未完成的推理 Part
3. **未完成的工具调用**：遍历 `toolcalls`，将未完成的工具调用标记为完成状态

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有处理逻辑都通过 Effect 生成器，天然支持并发、错误处理和资源管理

2. **Handle 工厂模式**：`create()` 返回一个 Handle，每个 Handle 绑定一个 Assistant 消息，支持同时处理多个独立消息的流

3. **Doom Loop 阈值 = 3**：平衡了自动重试的便利性和死循环保护，连续 3 次相同输入后由用户决定是否继续

4. **快照在流开始时捕获**：确保快照反映的是工具执行前的状态，patch 计算的是该 step 的实际变更

5. **延迟工具结算**：工具调用不一定在流处理期间完成，通过 `updateToolCall` / `completeToolCall` 支持外部异步完成

6. **双事件系统写入**：主事件总线和实验性 EventV2 并行写入，允许渐进式迁移而不破坏现有功能

7. **Cleanup 保证**：无论流正常结束还是异常终止，都确保所有未完成的 Part 被最终化，避免数据不一致

# @opencode/SessionCompaction — 上下文压缩服务
> 源文件: `opencode/packages/opencode/src/session/compaction.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/session/compaction.ts`

## 概述

`@opencode/SessionCompaction` 是 OpenCode 的**会话上下文压缩服务**，负责在对话 token 使用量超出上下文窗口时自动压缩历史消息，以及在 token 使用量过高时对旧工具输出进行裁剪（prune）。它基于 Effect 框架实现，对外暴露为 Effect Service，是维持长对话可用性的核心机制。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Bus` | `@opencode-ai/core/bus` | 事件总线，发布 `Event.Compacted` 事件通知其他模块 |
| `Config` | `@opencode/Config` | 配置服务，读取 `compaction` 相关配置（auto/prune/tail_turns/preserve_recent_tokens） |
| `Session` | `@opencode/Session` | 会话服务，读写会话消息列表 |
| `Agent` | `@opencode/Agent` | Agent 服务，获取 "compaction" agent 及其配置的模型 |
| `Plugin` | `@opencode/Plugin` | 插件服务，调用 autocontinue 等插件钩子 |
| `SessionProcessor` | `@opencode/SessionProcessor` | 会话处理器，管理消息处理流程 |
| `Provider` | `@opencode/Provider` | AI Provider 服务，执行 LLM 调用生成压缩摘要 |
| `EventV2Bridge` | `@opencode/EventV2Bridge` | 事件桥接，V2 事件格式转换 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 运行时标志，控制运行模式 |

```typescript
// session-compaction.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service
  const config = yield* Config.Service
  const session = yield* Session.Service
  const agent = yield* Agent.Service
  const plugin = yield* Plugin.Service
  const processor = yield* SessionProcessor.Service
  const provider = yield* Provider.Service
  const eventV2Bridge = yield* EventV2Bridge.Service
  const runtimeFlags = yield* RuntimeFlags.Service
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(Bus.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(Agent.defaultLayer),
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(SessionProcessor.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(EventV2Bridge.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

压缩触发分为两种场景：

1. **Overflow 压缩**：当 `isOverflow()` 检测到 token 使用量超出模型上下文窗口时触发，自动压缩历史消息为摘要，并可选择重放最后一条用户消息
2. **Auto 压缩**：由外部调用 `process()` 主动触发（如前端发送消息前检测），在 token 接近上限时预压缩
3. **Prune 裁剪**：当 token 用量超过 `PRUNE_MINIMUM`（20000）时，`prune()` 向后遍历消息部件，裁剪旧工具输出以释放 token

## 核心接口

```typescript
export interface Interface {
  readonly isOverflow: () => Effect.Effect<boolean>          // 检测是否超出上下文窗口
  readonly prune: () => Effect.Effect<void>                   // 裁剪旧工具输出
  readonly process: (input: ProcessInput) => Effect.Effect<void>  // 执行压缩流程
  readonly create: (input: CreateInput) => Effect.Effect<void>    // 创建压缩用户消息
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionCompaction") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 检测溢出
yield* SessionCompaction.Service.isOverflow()

// 创建压缩标记
yield* SessionCompaction.Service.create({ type: "overflow" })

// 执行压缩
yield* SessionCompaction.Service.process({ type: "overflow" })

// 裁剪工具输出
yield* SessionCompaction.Service.prune()
```

## 数据结构

### Turn

```typescript
interface Turn {
  start: number   // 该轮起始消息索引
  end: number     // 该轮结束消息索引（不含）
  id: string      // 该轮标识符
}
```

`Turn` 表示对话中的一轮（一次用户消息及对应的助手回复）。`start` 和 `end` 是消息数组的索引范围，`id` 用于追踪和去重。

### Tail

```typescript
interface Tail {
  start: number   // 尾部起始消息索引
  id: string      // 尾部标识符
}
```

`Tail` 表示被保留在压缩后上下文中的尾部消息范围。在 overflow 场景中，尾部包含需要重放的最后一条用户消息。

### CompletedCompaction

```typescript
interface CompletedCompaction {
  userIndex: number       // 压缩用户消息在消息数组中的索引
  assistantIndex: number  // 压缩生成的摘要助手消息在消息数组中的索引
  summary: string         // 压缩摘要文本内容
}
```

`CompletedCompaction` 表示一次已完成的压缩操作，记录压缩标记消息、生成的摘要消息及其内容，用于后续压缩时的摘要锚定。

### CreateInput / ProcessInput

```typescript
interface CreateInput {
  type: "auto" | "overflow"   // 压缩类型：自动预压缩 或 溢出触发
}

interface ProcessInput {
  type: "auto" | "overflow"   // 压缩类型，与 CreateInput 对应
}
```

## 关键实现细节

### isOverflow — 溢出检测

```typescript
isOverflow(): Effect.Effect<boolean>
```

调用 overflow 模块检测当前会话的 token 使用量是否超出模型的上下文窗口限制。这是触发 overflow 压缩的前置条件。

### create — 创建压缩标记

```typescript
create(input: CreateInput): Effect.Effect<void>
```

向会话消息列表末尾插入一条特殊的用户消息，该消息包含一个 `type` 为 `"compaction"` 的内容部件，附带 `auto` 或 `overflow` 标志。这条消息作为后续 `process()` 识别压缩起点的标记。

### process — 主压缩流程

```typescript
process(input: ProcessInput): Effect.Effect<void>
```

完整的压缩流程如下：

```
process(input)
  ├── 1. 查找压缩父消息
  │     └── 在消息列表中定位 type="compaction" 的 compaction 用户消息
  ├── 2. Overflow 预处理
  │     └── 提取最后一条非 compaction 用户消息，作为压缩后重放的消息
  ├── 3. 获取 compaction agent 和模型
  │     └── 使用 "compaction" agent 配置的模型进行 LLM 调用
  ├── 4. select() — 选择压缩范围
  │     ├── 保留最近 turns（受 preserveRecentBudget 控制）
  │     ├── 支持部分 turn 分割：当单个 turn 过大时，可将其拆分为摘要部分和保留部分
  │     └── 返回需要摘要化的消息范围
  ├── 5. 上下文准备
  │     ├── 剥离媒体附件（图片等大型二进制内容）
  │     ├── 截断工具输出：超过 TOOL_OUTPUT_MAX_CHARS (2000) 的部分被裁剪
  │     └── 构建压缩 prompt
  ├── 6. 构建 Prompt
  │     ├── 使用 SUMMARY_TEMPLATE 生成结构化摘要模板
  │     └── 如有上一次压缩的摘要，作为锚定上下文传入
  ├── 7. LLM 调用
  │     └── 调用 Provider 生成结构化摘要
  ├── 8. 写入摘要消息
  │     └── 将 LLM 生成的摘要作为 assistant 消息写入（标记 summary=true）
  ├── 9. Auto-continue（仅 auto 模式）
  │     └── 调用 autocontinue 插件钩子，可自动生成一条继续消息
  └── 10. Replay（仅 overflow 模式）
        └── 将步骤 2 中提取的用户消息重新追加到会话末尾
```

### select() — 压缩范围选择算法

`select()` 从消息列表中选择需要压缩的 turns，核心逻辑：

- **保留预算**：`preserveRecentBudget` 决定保留多少 token 给最近的对话。默认来自配置 `compaction.preserve_recent_tokens`，若未配置则使用可用上下文窗口的 25%，并限制在 2000-8000 token 范围内
- **向后遍历**：从消息列表尾部向前遍历，将最近的完整 turns 纳入保留范围，直到保留的 token 总量达到预算
- **部分 Turn 分割**：如果下一个待保留的 turn 过大（其 token 数超过剩余预算），`select()` 会将该 turn 拆分为两部分——前半部分纳入压缩范围，后半部分保留在上下文中

### prune — 工具输出裁剪

```typescript
prune(): Effect.Effect<void>
```

与 process 不同，prune 不生成摘要，而是直接裁剪消息中的工具输出内容：

- **触发条件**：token 用量超过 `PRUNE_MINIMUM`（20000）
- **保护机制**：最近 2 个 turns 的工具输出不被裁剪；`PRUNE_PROTECT`（40000）token 范围内的内容受到保护
- **受保护的工具**：`PRUNE_PROTECTED_TOOLS` 列表中的工具（当前仅 `"skill"`）输出不被裁剪
- **裁剪方式**：从消息数组后部向前遍历，对旧的工具调用结果进行截断，每次最多裁剪到 `TOOL_OUTPUT_MAX_CHARS`（2000 字符）

### 辅助函数

#### completedCompactions()

```typescript
completedCompactions(): Effect.Effect<CompletedCompaction[]>
```

扫描消息列表，找到所有标记为 `summary=true` 的 assistant 消息，并将它们与前面的 compaction 用户消息配对，返回已完成压缩的列表。这些历史摘要可用于后续压缩时的上下文锚定。

#### buildPrompt()

```typescript
buildPrompt(options: BuildPromptInput): string
```

构建压缩 prompt：
- 以 `SUMMARY_TEMPLATE` 为模板，要求 LLM 生成结构化摘要
- 如果存在上一次压缩的摘要，将其作为"Previous Summary"注入 prompt，帮助 LLM 保持摘要的连续性
- 注入需要摘要化的对话内容（已剥离媒体、截断工具输出）

#### turns()

```typescript
turns(messages: Message[]): Turn[]
```

从消息列表中提取用户消息 turns，排除 compaction 类型的消息。每个 turn 以用户消息为边界，`start` 和 `end` 为消息索引范围。

### 常量定义

| 常量 | 值 | 说明 |
|------|-----|------|
| `PRUNE_MINIMUM` | 20000 | 触发 prune 的 token 阈值 |
| `PRUNE_PROTECT` | 40000 | prune 保护范围（token 数） |
| `TOOL_OUTPUT_MAX_CHARS` | 2000 | 工具输出最大字符数（压缩和裁剪均使用） |
| `PRUNE_PROTECTED_TOOLS` | `["skill"]` | prune 不裁剪的工具列表 |
| `DEFAULT_TAIL_TURNS` | 2 | 默认保留的尾部 turns 数 |

### SUMMARY_TEMPLATE

LLM 生成摘要时使用的结构化模板，要求输出以下字段：

| 字段 | 说明 |
|------|------|
| **Goal** | 用户当前正在完成的目标 |
| **Constraints** | 已知的约束条件 |
| **Progress** | 已完成的工作和发现 |
| **Key Decisions** | 做出的关键决策及原因 |
| **Next Steps** | 下一步计划 |
| **Critical Context** | 必须保留的关键上下文 |
| **Relevant Files** | 涉及的相关文件列表 |

### 事件

压缩完成后，通过 Bus 发布 `Event.Compacted` 事件，通知其他模块（如前端 UI）更新显示。

## 关键设计决策

1. **Overflow 与 Auto 双模式**：Overflow 由 token 溢出被动触发，Auto 由外部主动调用。Overflow 模式额外包含消息提取和重放逻辑，确保用户的最新输入不会丢失

2. **先 create 后 process 的两阶段设计**：`create` 先插入标记消息，`process` 再基于标记执行压缩。这种分离允许调用方在 create 和 process 之间插入其他逻辑（如等待 UI 确认）

3. **部分 Turn 分割**：`select()` 算法支持将单个过大的 turn 拆分为摘要部分和保留部分，避免因一个大 turn 导致整个压缩失败或丢失过多上下文

4. **媒体剥离 + 工具输出截断**：在送入 LLM 压缩前，剥离图片等媒体附件，将工具输出截断到 2000 字符。这既减少了 token 消耗，又避免了 LLM 被大量工具输出噪声干扰

5. **结构化摘要模板**：使用固定的 `SUMMARY_TEMPLATE`（Goal、Constraints、Progress、Key Decisions、Next Steps、Critical Context、Relevant Files）确保每次压缩输出格式一致，便于后续压缩时的锚定和人类阅读

6. **摘要锚定**：`buildPrompt()` 将上一次压缩的摘要注入当前压缩 prompt，使多次压缩之间保持连续性，避免信息在迭代压缩中逐步丢失

7. **Prune 渐进式裁剪**：不同于 process 的 LLM 摘要方式，prune 直接截断旧工具输出文本，计算成本低、速度快，适合作为 token 超标时的第一道防线

8. **Skill 工具保护**：`PRUNE_PROTECTED_TOOLS` 将 skill 工具的输出排除在裁剪之外，因为 skill 输出通常包含关键的结构化指令，直接截断可能导致功能异常

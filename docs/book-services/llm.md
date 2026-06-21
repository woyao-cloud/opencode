# @opencode/LLM — 大语言模型流式调用服务

## 概述

`@opencode/LLM` 是 OpenCode 的**大语言模型流式调用服务**，负责将对话消息和工具配置组装为 LLM 请求，通过 AI SDK 的 `streamText` 函数发起流式调用，并将返回的 token 流转换为结构化事件流。它不直接调用底层 Provider API，而是作为中间层，整合 Provider 配置、Plugin 钩子、权限规则和模型参数，生成标准化的调用参数。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Auth` | `@opencode/Auth` | 认证服务，提供 OpenAI OAuth token、会话身份信息 |
| `Config` | `@opencode/Config` | 配置服务，获取 agent 定义、模型选项、实验性开关 |
| `Provider` | `@opencode/Provider` | Provider 转换层，将模型 ID 映射到具体 Provider 参数 |
| `Plugin` | `@opencode/Plugin` | 插件系统，提供 system prompt 变换、请求参数和请求头钩子 |
| `Permission` | `@opencode/Permission` | 权限服务，决定哪些工具在当前上下文中可用 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 运行时标志，控制实验性功能和开关 |

```typescript
// llm.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const auth = yield* Auth.Service
  const config = yield* Config.Service
  const provider = yield* Provider.Service
  const plugin = yield* Plugin.Service
  const permission = yield* Permission.Service
  const runtimeFlags = yield* RuntimeFlags.Service
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(Permission.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

调用流程从 `stream` 方法入口，经过参数组装、Provider 转换、插件钩子、权限过滤，最终通过 `streamText` 发出请求：

```
stream(input)
  ├── 1. 参数组装
  │     ├── 解析 system prompt（agent 定义 prompt / SystemPrompt.provider(model) / 自定义 system）
  │     ├── 解析 messages 列表
  │     ├── 解析 tools 配置（权限过滤）
  │     ├── 解析模型参数（temperature / topP / topK）
  │     └── 构建自定义请求头
  ├── 2. Provider 转换
  │     └── ProviderTransform.model() → 解析 provider 名称和实际 model ID
  ├── 3. Plugin 钩子
  │     ├── experimental.chat.system.transform → 变换 system prompt
  │     ├── chat.params → 修改请求参数
  │     └── chat.headers → 添加自定义请求头
  ├── 4. 模型选项合并
  │     └── mergeDeep(baseOptions, modelOptions, agentOptions, variantOptions)
  ├── 5. 特殊 Provider 处理
  │     ├── OpenAI OAuth → instructions 注入到 options
  │     ├── GitLab DWS → 配置 toolExecutor / sessionPreapprovedTools / approvalHandler
  │     └── GitHub Copilot → 注入 _noop 占位工具
  ├── 6. streamText 调用
  │     └── 传入 model / messages / system / tools / maxRetries 等参数
  └── 7. 可选 OpenTelemetry 追踪
```

## 核心接口

```typescript
export interface Interface {
  readonly stream: (input: StreamInput) => Effect.Effect<Stream<LLMEvent>, StreamLlmError>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/LLM") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 发起流式 LLM 调用
yield* LLM.Service.stream({
  user: { id: "user-1", ... },
  sessionID: "session-abc",
  model: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  agent: "default",
  system: "You are a helpful assistant.",
  messages: [...],
  tools: { read: readTool, write: writeTool, ... },
})
```

## 关键数据结构

### StreamInput

调用 `stream` 方法的输入参数，包含一次 LLM 调用所需的全部上下文：

| 字段 | 类型 | 说明 |
|------|------|------|
| `user` | `UserMessage` | 用户身份信息（id、username 等） |
| `sessionID` | `string` | 当前会话 ID |
| `parentSessionID` | `string?` | 父会话 ID（用于子会话/子 agent 场景） |
| `model` | `ModelID` | 目标模型标识，格式 `{ provider, model }` |
| `agent` | `string?` | 当前使用的 agent 名称 |
| `permission` | `PermissionInfo?` | 权限配置，控制工具可用性 |
| `system` | `string?` | 自定义 system prompt（追加到 agent 默认 prompt 之后） |
| `messages` | `Message[]` | 对话消息列表 |
| `small` | `boolean?` | 是否使用轻量模式（如标题生成） |
| `tools` | `Record<string, ToolDef>` | 可用工具定义映射 |
| `retries` | `number?` | 最大重试次数 |
| `toolChoice` | `ToolChoice?` | 工具选择策略（auto/none/required/指定工具） |

### StreamRequest

内部使用的完整请求对象，在 `StreamInput` 基础上添加了取消控制：

| 字段 | 类型 | 说明 |
|------|------|------|
| （继承 StreamInput 所有字段） | | |
| `abort` | `AbortSignal` | 用于取消正在进行的流式请求 |

## Provider 特定处理

### 通用流程

对于所有 Provider，LLM 服务执行以下通用流程：

1. **System Prompt 构建**：优先使用 agent 配置中的 `prompt` 字段，其次使用 `SystemPrompt.provider(model)` 生成的 Provider 特定 prompt，最后追加 `input.system` 自定义 prompt
2. **Plugin 钩子调用**：按顺序执行 `experimental.chat.system.transform`（变换 system prompt）、`chat.params`（修改请求参数）、`chat.headers`（添加请求头）
3. **模型选项合并**：使用 `mergeDeep`（remeda）深度合并 base options → model options → agent options → variant options

### OpenAI OAuth

当使用 OpenAI OAuth 认证时，指令（instructions）不通过 system messages 传递，而是直接注入到 API 请求的 `options` 字段中：

```typescript
if (provider === "openai" && auth.type === "oauth") {
  options.instructions = systemPrompt
  // system messages 中不再包含这些指令
}
```

### GitLab Workflow (DWS)

当 Provider 为 GitLab Duo Workflow (DWS) 时，启用 WebSocket 级别的工具执行模式：

- **toolExecutor**：通过 WebSocket 将工具调用转发给客户端执行
- **sessionPreapprovedTools**：会话级别的预批准工具列表
- **approvalHandler**：工具批准回调，允许客户端在执行前确认

### GitHub Copilot

当对话历史中包含工具调用但当前没有活跃工具时，注入一个 `_noop` 占位工具，防止 AI SDK 因工具调用引用无效而报错。

## 工具解析与权限过滤

### 权限过滤

`stream` 方法会根据 `Permission` 服务的规则过滤可用工具：

1. 获取当前会话的权限配置（通过 `input.permission` 或默认规则）
2. 遍历 `input.tools`，过滤掉被权限规则禁用的工具
3. 将过滤后的工具映射为 AI SDK 所需的 tool 格式

```typescript
const enabledTools = Object.entries(input.tools)
  .filter(([name]) => permission.isToolEnabled(name, rules))
  .map(([name, def]) => toAISdkTool(name, def))
```

### experimental_repairToolCall

启用了 AI SDK 的 `experimental_repairToolCall` 功能，当 LLM 返回的工具调用名称大小写不匹配时，自动修复为正确的大小写：

```typescript
experimental_repairToolCall: async (request) => {
  // 在可用工具列表中查找大小写不敏感匹配
  const match = availableTools.find(t => t.toLowerCase() === request.toolName.toLowerCase())
  if (match) return { ...request, toolName: match }
  throw new Error(`Tool not found: ${request.toolName}`)
}
```

## 模型参数配置

### 温度 (Temperature)

按优先级从以下来源获取：

1. Agent 配置的 `temperature` 字段
2. 模型自身的能力声明（`model.capabilities.temperature`）
3. Provider 转换层返回的默认值（`ProviderTransform.model()` 的返回值）

### topP / topK

类似 temperature，按相同优先级从 agent 配置、模型能力、Provider 默认值中获取。

## 自定义请求头

LLM 服务在请求中添加以下自定义头：

| 请求头 | Provider | 说明 |
|--------|----------|------|
| `x-opencode-project` | opencode | 当前项目标识 |
| `x-opencode-session` | opencode | 当前会话 ID |
| `x-opencode-request` | opencode | 当前请求 ID |
| `x-opencode-client` | opencode | 客户端标识 |
| `x-session-affinity` | 其他 | 会话亲和性标识，用于负载均衡 |

## maxRetries 配置

最大重试次数可通过配置控制，默认值为 `0`（不重试）：

```typescript
const maxRetries = input.retries ?? config.experimental?.maxRetries ?? 0
```

## OpenTelemetry 追踪

当实验性配置中启用 OpenTelemetry 时，LLM 调用会自动生成追踪 span：

```typescript
if (config.experimental?.opentelemetry) {
  // 创建 span 并注入到 streamText 的 experimental_context 中
}
```

## OUTPUT_TOKEN_MAX

模块导出一个常量 `OUTPUT_TOKEN_MAX`，用于限制单次 LLM 调用的最大输出 token 数。该常量在 `streamText` 调用中作为 `maxOutputTokens` 参数传入。

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有 LLM 调用都通过 Effect 生成器，天然支持并发、错误处理和资源管理

2. **Provider 抽象层**：不直接调用各 Provider API，而是通过 `@opencode/Provider` 转换层统一处理模型 ID 解析和参数映射，使得上层代码与具体 Provider 解耦

3. **Plugin 钩子链**：system prompt 变换、请求参数修改、请求头添加都通过 Plugin 钩子实现，允许第三方插件在不修改核心代码的情况下介入 LLM 调用流程

4. **工具权限过滤**：在发起 LLM 请求前，根据权限规则过滤可用工具，确保 LLM 不会尝试调用用户未授权的工具

5. **大小写不敏感工具修复**：`experimental_repairToolCall` 自动修复 LLM 返回的工具名称大小写错误，减少因大小写不匹配导致的调用失败

6. **深度合并模型选项**：使用 `mergeDeep` 将基础选项、模型选项、agent 选项和变体选项深度合并，使得各层配置可以叠加生效而非简单覆盖

7. **零重试默认策略**：`maxRetries` 默认为 0，由调用方显式控制重试行为，避免不必要的重复调用消耗 token

# 模块 3 · LLM 抽象层

`packages/llm` 是 opencode 与 LLM 提供商通信的底层库。它提供 Provider 路由、类型安全工具定义、工具运行时调度和流式协议解析。

## 3.1 目录结构

```text
packages/llm/src/
├── index.ts           # 包入口：导出公共 API
├── provider.ts        # Provider 和 Model 的类型定义与工厂函数
├── tool.ts            # 类型安全工具定义（Typed/Dynamic 两种模式）
├── tool-runtime.ts    # 工具运行时：调度、解码、执行、编码
├── stream.ts          # 流式处理：SSE → LLMEvent 转换
├── schema/            # Schema 定义（ID 类型、消息格式、工具定义等）
├── protocols/         # 协议适配器
│   ├── anthropic-messages.ts     # Anthropic Messages API
│   ├── openai-compatible-chat.ts # OpenAI Compatible Chat API
│   └── bedrock-converse.ts       # AWS Bedrock Converse API
├── providers/         # 各提供商的模型定义
│   ├── anthropic.ts
│   ├── openai.ts
│   ├── amazon-bedrock.ts
│   ├── google-vertex.ts
│   ├── google-vertex-anthropic.ts
│   ├── github-copilot.ts
│   ├── openai-compatible.ts      # 兼容 OpenAI API 的提供商基类
│   └── openai-compatible-profile.ts  # Groq、DeepSeek、Fireworks 等
└── route/             # 路由/客户端抽象
    └── client.ts      # Model 引用解析、HTTP 客户端
```

## 3.2 Provider 和 Model 体系

### Provider 定义

Provider 代表一个 LLM 服务提供商。每个 Provider 导出：
- `id`：唯一标识（如 `"anthropic"`、`"openai"`）
- `model` 工厂函数：接收 Model ID，返回 Model 定义
- `routes`：该 Provider 支持的协议路由

### Model 定义

Model 代表一个具体的模型实例。关键字段：

| 字段 | 说明 |
|------|------|
| `id` | 模型标识（如 `"claude-sonnet-4-6"`） |
| `providerID` | 所属 Provider |
| `api.id` | API 端的模型 ID（可能与本地 id 不同） |
| `api.url` | API 端点 URL |
| `api.npm` | 使用的 AI SDK npm 包（如 `"@ai-sdk/anthropic"`） |
| `limit.context` | 最大上下文窗口 Token 数 |
| `limit.input` | 最大输入 Token 数 |
| `limit.output` | 最大输出 Token 数 |
| `capabilities` | 能力声明（Vision、Reasoning、Tool Call、Streaming 等） |
| `cost` | Token 单价（输入/输出/缓存读写） |
| `variants` | 模型变体（如不同的 Reasoning Effort 级别） |
| `options` | 默认 API 参数（temperature、top_p 等） |

### 模型解析链

当需要确定使用哪个模型时，框架按以下优先级查找：
1. Session 级别指定
2. 命令行 `--model` 参数
3. Agent 默认模型
4. 项目配置
5. 全局配置
6. 框架默认

## 3.3 工具抽象（`tool.ts`）

### 两种定义模式

**Typed 模式**：编译时类型安全。使用 Effect Schema 定义参数和返回值。

**Dynamic 模式**：运行时动态加载。使用原始 JSON Schema，适用于 MCP 工具等外部来源。

### 工具内部结构

每个工具携带：
- `_decode`：将 LLM 返回的 JSON 参数解码为类型安全输入
- `_encode`：将执行结果编码为 JSON
- `_definition`：预计算的 ToolDefinition（名称、描述、JSON Schema）

### 工具列表转换

`toDefinitions(tools)` 将工具记录转换为 LLM API 期望的 `ToolDefinition[]` 格式。

## 3.4 工具运行时（`tool-runtime.ts`）

工具运行时负责接收 LLM 返回的 tool_call，调度执行，返回结果。

### 核心流程

```
LLM 返回 tool_call
  → 查找工具（tools[call.name]）
  → 解码参数（tool._decode(call.input)）
  → 执行工具（tool.execute(decoded)）
  → 编码结果（tool._encode(value)）
  → 返回 ToolResultPart
```

### 错误处理

- 工具未找到 → 返回 error result
- 参数解码失败 → 返回 `ToolFailure`
- 执行失败 → 返回 error result（含错误信息）
- 结果编码失败 → 返回 `ToolFailure`

### 并发执行

多个 tool_call 在同一 Step 中被 LLM 返回时，工具运行时并行执行它们。使用 Effect 的结构化并发（Fiber）。

## 3.5 协议适配器（`protocols/`）

协议适配器将不同提供商的流式事件转换为统一的 LLMEvent。

### Anthropic Messages 适配器

处理 Anthropic Messages API 的 SSE 流。事件类型：
- `message_start` → 消息开始（含 usage 信息）
- `content_block_start` → 内容块开始（text/tool_use）
- `content_block_delta` → 内容增量（text_delta/input_json_delta）
- `content_block_stop` → 内容块结束
- `message_delta` → 消息增量（含 stop_reason）
- `message_stop` → 消息结束

### OpenAI Compatible Chat 适配器

处理 OpenAI Chat Completions API 及所有兼容提供商的 SSE 流。兼容提供商包括：Groq、Cerebras、DeepSeek、Fireworks、TogetherAI、DeepInfra、Baseten 等。

### Bedrock Converse 适配器

处理 AWS Bedrock Converse API 的二进制分帧流。特殊处理 AWS 的错误事件类型（`internalServerException`、`modelStreamErrorException`、`validationException`、`throttlingException`）。

### 统一的 LLMEvent 类型

所有适配器输出统一的 LLMEvent：
- `text-delta`：文本增量
- `reasoning-delta`：推理内容增量
- `tool-input-start`：工具调用开始
- `tool-input-delta`：工具参数增量
- `tool-call`：完整工具调用
- `finish`：调用结束（含 finish_reason 和 usage）
- `provider-error`：提供商错误

### Lifecycle 状态机

`protocols/shared.ts` 中的 Lifecycle 状态机抽象了流式协议的通用模式：
1. 内容块开始 → 标记新块
2. 增量数据 → 累积到当前块
3. 内容块结束 → 完成当前块
4. 消息结束 → 完成整个响应

## 3.6 添加新 Provider 的步骤

1. 在 `providers/` 下创建新文件（如 `new-provider.ts`）
2. 定义 Provider（使用 `Provider.make()`）
3. 定义 Model 工厂函数
4. 如果使用新协议，在 `protocols/` 下创建适配器
5. 如果兼容已有协议（如 OpenAI Compatible），复用现有适配器
6. 在 `index.ts` 中导出新 Provider

---

## 本章小结

`packages/llm` 通过 Provider/Model 定义体系、类型安全工具抽象、工具运行时调度和协议适配器三层架构，将 LLM 提供商的差异封装在可替换的模块中。理解这三层架构是理解 opencode 如何接入多模型的关键。

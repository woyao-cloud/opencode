# 第 10 章 · Provider 抽象层

opencode 需要同时接入十几个 LLM 提供商，每个提供商的 API 格式、流式协议、能力声明方式各不相同。Provider 抽象层通过统一的 Provider/Model 定义、消息转换管道和协议适配器，将这些差异封装在可替换的模块中。

## 10.1 多模型支持架构

### Provider 和 Model 的定义

Provider（提供商）和 Model（模型）是两层抽象：

**Provider** 代表一个 LLM 服务提供商（如 Anthropic、OpenAI、AWS Bedrock）。Provider 定义包含：
- `id`：唯一标识（如 `"anthropic"`、`"openai"`、`"amazon-bedrock"`）
- `model` 工厂函数：接收 Model ID，返回 Model 定义

**Model** 代表一个具体的模型实例（如 `claude-sonnet-4-6`、`gpt-5`）。Model 定义包含：
- `id`：模型标识
- `providerID`：所属 Provider
- `api`：API 配置（端点 URL、使用的 npm 包）
- `limit`：能力限制（上下文窗口、最大输入/输出 Token）
- `capabilities`：能力声明（是否支持 Vision、Reasoning、Tool Call、Streaming 等）
- `cost`：成本信息（输入/输出/缓存 Token 的单价）
- `variants`：模型变体（如不同的 Reasoning Effort 级别）
- `options`：默认的 API 参数（temperature、top_p 等）
- `headers`：额外的 HTTP 头

### Provider 注册

Provider 通过静态定义注册。每个 Provider 有一个对应的源文件（如 `packages/llm/src/providers/anthropic.ts`），导出 `provider` 对象。框架在启动时加载所有 Provider 定义，构建 Provider 注册表。

### 模型发现

模型可以通过两种方式发现：
- **静态定义**：框架内置的模型列表（常用模型）
- **动态获取**：部分 Provider（如 GitHub Copilot）支持从 API 端点动态获取可用模型列表

## 10.2 消息转换管道

消息在发送给 LLM API 之前，需要经过转换管道（Transform Pipeline）处理。转换管道位于 `packages/opencode/src/provider/transform.ts`。

### 转换步骤

1. **移除不支持的 Part**：根据 Model 的能力声明，移除该模型不支持的 Part 类型。例如，不支持 Vision 的模型会移除 FilePart 中的图片内容。

2. **归一化消息结构**：将 opencode 的内部消息格式转换为目标 API 期望的格式。不同 API 对 system 消息、user 消息、assistant 消息、tool_result 消息的格式要求不同。

3. **注入缓存标记**：对于 Anthropic 模型（以及使用 Anthropic API 格式的其他提供商），在消息中注入 `cache_control` 标记，指定哪些内容块应该被缓存。

4. **重映射 Provider Options**：opencode 内部使用 `providerID` 作为 Provider Options 的键名，但 AI SDK 期望的键名可能不同（如 npm 包名）。转换管道负责键名重映射。

### Anthropic 缓存注入

缓存注入是转换管道中最复杂的步骤。框架需要判断哪些消息内容应该被缓存：

- System Prompt 中的内容：标记为可缓存
- 工具定义：标记为可缓存
- 历史消息中已被压缩的部分：标记为可缓存
- 最近几条消息：不标记缓存（因为它们每轮都在变化）

缓存断点的位置需要精确控制——缓存断点之后的所有内容都不会被缓存，因此断点应该放在"变化内容"开始之前。

## 10.3 协议适配器

协议适配器是 Provider 抽象层的最底层——它们处理原始 SSE 流的解析，将不同提供商的流式事件转换为统一的 LLMEvent。

### 适配器类型

opencode 内置了三种协议适配器：

**Anthropic Messages 适配器**（`@ai-sdk/anthropic`）：
- 处理 Anthropic 的 Messages API 流式响应
- 事件类型：`message_start`、`content_block_start`、`content_block_delta`、`content_block_stop`、`message_delta`、`message_stop`
- 特殊处理：推理内容（thinking）的加密/解密、缓存读写量的提取

**OpenAI Compatible Chat 适配器**（`@ai-sdk/openai` 及兼容）：
- 处理 OpenAI Chat Completions API 及所有兼容提供商的流式响应
- 事件类型：`chat.completion.chunk`（delta + finish_reason）
- 兼容提供商包括：Groq、Cerebras、DeepSeek、Fireworks、TogetherAI、DeepInfra、Baseten 等

**Bedrock Converse 适配器**（`@ai-sdk/amazon-bedrock`）：
- 处理 AWS Bedrock Converse API 的二进制分帧流
- 事件类型：`contentBlockStart`、`contentBlockDelta`、`contentBlockStop`、`messageStop`、`metadata`
- 特殊处理：AWS 的错误事件类型（`internalServerException`、`modelStreamErrorException`、`validationException`、`throttlingException`）

### 适配器的统一抽象

尽管各提供商的原始事件格式不同，所有适配器都输出统一的 **LLMEvent** 流。这个统一抽象使得上游代码（Processor、UI）不需要关心底层是哪个提供商。

### 流式协议的通用模式

尽管格式不同，所有流式协议都遵循相似的模式：

1. **内容块开始**：标记一个新内容块的开始（文本块、推理块或工具调用块）
2. **增量数据**：该内容块的增量数据到达
3. **内容块结束**：该内容块完成
4. **消息结束**：整个响应完成，包含 finish_reason 和 usage

opencode 的 `Lifecycle` 状态机抽象了这个通用模式，每个适配器将原生事件映射到 Lifecycle 状态转换。

## 10.4 工具定义的统一抽象

工具定义也需要适配不同 API 的格式。opencode 的 `Tool.toDefinitions()` 函数将内部的 `Tool` 对象转换为 `ToolDefinition` 数组——这是 LLM API 期望的工具列表格式。

每个 `ToolDefinition` 包含：
- `name`：工具名称
- `description`：工具描述
- `inputSchema`：JSON Schema 格式的参数定义

这个转换是 Provider 无关的——所有 Provider 都使用相同的 ToolDefinition 格式（JSON Schema），因为这是业界标准。

---

## 本章小结

Provider 抽象层通过 Provider/Model 定义、消息转换管道和协议适配器三层架构，将十几个 LLM 提供商的差异封装在可替换的模块中。消息转换管道确保发送给每个模型的请求都符合其格式要求，协议适配器确保从每个模型收到的流式响应都被统一处理。这种设计使得添加新 Provider 只需要实现一个适配器，上游代码无需任何修改。

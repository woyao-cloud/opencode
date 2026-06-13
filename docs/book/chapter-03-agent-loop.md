# 第 3 章 · Agent 运行循环：从输入到响应

这是全书最核心的章节。我们将完整追踪一次用户输入如何触发 AI 响应、工具执行、以及可能的多次 LLM 调用，直到最终结果返回给用户。

## 3.1 会话生命周期

在理解运行循环之前，需要先了解 Session（会话）的生命周期。Session 是 opencode 中对话的基本容器，它承载了消息历史、上下文状态、Agent 配置和模型选择。

### 创建

当用户执行 `opencode run "帮我修复这个 bug"` 时，框架首先创建一个 Session。创建过程包括：
- 生成唯一 Session ID
- 确定工作目录（当前目录或用户指定目录）
- 加载项目配置（`.opencode/` 目录下的设置）
- 关联默认 Agent 和模型
- 初始化权限规则集

Session 创建后，其元数据（标题、目录、模型、Agent）被持久化到本地存储中。

### Fork（分支）

Fork 是 opencode 的一个特色机制。用户可以从一个已有 Session 的任意消息点"分叉"出一个新 Session。新 Session 会复制原 Session 到分叉点为止的所有消息，但之后的对话走向完全独立。

Fork 的实际用途包括：
- 在某个 AI 回复不理想时，从该回复之前分叉，尝试不同的提示方式
- 对同一个问题探索多种解决方案，每个方案在独立分支中进行
- 团队协作中，不同开发者从同一个起点分叉出各自的工作流

### 继续（Continue）

用户可以通过 `opencode run --continue` 恢复最近的 Session，或通过 `--session <id>` 指定恢复某个特定 Session。恢复时，框架加载完整的消息历史和上下文状态，新消息追加在已有历史之后。

### 归档

Session 可以被归档（Archive），归档后的 Session 从默认列表中隐藏，但数据保留，可以随时取消归档。

## 3.2 消息准备：从用户输入到 Part 组装

当用户输入一段文本（可能附带文件引用、图片等），框架首先将其拆解为 **Part** 数组。Part 是 opencode 中消息内容的基本单位。

### Part 的类型

V2 协议定义了以下 Part 类型：

- **TextPart**：纯文本内容，是最常见的 Part 类型
- **FilePart**：文件引用，包含文件路径、MIME 类型、内容（通过 data URL 或文件路径）
- **AgentPart**：引用另一个 Agent 的定义作为上下文
- **SubtaskPart**：子任务引用，用于多 Agent 协作场景
- **ToolPart**：工具调用及其状态（由 AI 生成，不是用户输入）
- **StepStartPart / StepFinishPart**：标记一次 LLM 调用的开始和结束
- **ReasoningPart**：AI 的思考过程（推理内容）
- **CompactionPart**：上下文压缩标记
- **SnapshotPart / PatchPart**：文件快照和补丁

### 用户输入的拆解

用户输入经过以下处理步骤：

1. **文本提取**：纯文本部分直接成为 TextPart
2. **文件引用解析**：用户通过 `@filename` 引用的文件被解析为 FilePart，框架读取文件内容并以 data URL 形式嵌入
3. **图片处理**：粘贴或引用的图片被转换为 base64 编码的 FilePart
4. **Audience 标注**：某些 Part 可能带有 audience 注解（`assistant` 或 `user`），标记为 `assistant` 的 Part 被视为"synthetic"（对用户不可见但发送给 AI），标记为 `user` 的 Part 被视为"ignored"（对用户可见但不发送给 AI）

### 斜杠命令识别

在 Part 组装完成后，框架检查文本是否以 `/` 开头。如果是，则识别为斜杠命令（如 `/compact`、`/agent` 等）。命令会被路由到对应的处理器，而非走正常的 Prompt 流程。

## 3.3 System Prompt 动态组装

System Prompt 是发送给 AI 的第一条消息，它定义了 AI 的角色、能力边界和行为规范。opencode 的 System Prompt 不是静态字符串，而是**动态组装**的。

### 组装来源

System Prompt 由以下来源按优先级合并：

1. **Agent 定义**：当前使用的 Agent 的 System Prompt 模板。每个 Agent（如 `claude`、`build`、`plan`）都有自己专属的 System Prompt，定义了它的角色和专长。

2. **指令文件（AGENTS.md / CLAUDE.md）**：框架从工作目录向上遍历，寻找 `AGENTS.md` 和 `CLAUDE.md` 文件。找到的所有指令文件内容被注入 System Prompt。此外，全局配置目录（`~/.claude/CLAUDE.md`）中的指令也会被加载。

3. **远程指令 URL**：项目配置中可以指定远程 URL 作为指令来源，框架在会话启动时获取并缓存这些内容。

4. **动态上下文**：当前工作目录、Git 分支、操作系统等环境信息被自动注入。

5. **工具列表**：当前可用的工具及其描述被注入，让 AI 知道它可以调用哪些工具。

### 指令文件的层级发现

指令文件的发现遵循"就近原则"：当 AI 读取某个文件时，框架从该文件所在目录向上走到项目根，沿途寻找 `AGENTS.md` 和 `CLAUDE.md`。找到的指令文件内容被注入到当前消息的上下文中。这意味着项目不同子目录可以有各自的指令，AI 在处理不同区域的代码时会看到不同的上下文规则。

### 去重机制

框架维护一个"已注入"集合，确保同一个指令文件在同一条 Assistant 消息中只被注入一次，避免重复膨胀上下文。

## 3.4 模型选择与 Provider 路由

在消息准备好之后，框架需要决定使用哪个模型。

### 模型解析链

模型选择遵循以下优先级：

1. **Session 级别指定**：如果 Session 创建时指定了模型，优先使用
2. **命令行参数**：`--model` 参数可以覆盖 Session 的模型设置
3. **Agent 默认模型**：Agent 定义中可能指定了推荐的模型
4. **项目配置**：`.opencode/config.json` 中的默认模型设置
5. **全局配置**：用户全局设置中的默认模型
6. **框架默认**：硬编码的 fallback 模型

### Provider 路由

模型 ID 的格式为 `providerID/modelID`（如 `anthropic/claude-sonnet-4-6`）。框架根据 providerID 查找对应的 Provider 定义，Provider 定义中包含：
- API 端点 URL
- 使用的协议适配器（如 `@ai-sdk/anthropic`）
- 模型的能力声明（上下文窗口大小、是否支持 Vision、是否支持 Reasoning 等）
- 成本信息（输入/输出 Token 价格）

## 3.5 流式 API 通信

opencode 与 LLM 的通信采用**流式 HTTP 请求**（Server-Sent Events，SSE）。

### 请求发送

框架将消息列表（System Prompt + 历史消息 + 当前用户消息）和工具定义序列化为 LLM API 期望的格式，通过 HTTP POST 发送到模型端点。请求中包含：
- `messages`：完整的对话历史
- `tools`：可用工具列表及其 JSON Schema
- `system`：System Prompt（或作为第一条消息）
- `stream: true`：要求流式响应
- 模型特定参数（temperature、max_tokens、thinking budget 等）

### 流解析

不同提供商的 SSE 格式各不相同。opencode 通过**协议适配器**统一处理：

- **Anthropic Messages API**：事件类型包括 `message_start`、`content_block_start`、`content_block_delta`、`content_block_stop`、`message_delta`、`message_stop`
- **OpenAI Compatible Chat API**：事件类型包括 `chat.completion.chunk`，每个 chunk 包含 `delta`（增量内容）和 `finish_reason`
- **Bedrock Converse API**：AWS 的二进制分帧流，事件类型包括 `contentBlockStart`、`contentBlockDelta`、`contentBlockStop`、`messageStop`、`metadata`

每种适配器将原生事件转换为统一的 **LLMEvent** 类型：
- `text-delta`：文本增量
- `reasoning-delta`：推理内容增量
- `tool-input-start`：工具调用开始
- `tool-input-delta`：工具参数增量
- `tool-call`：完整的工具调用
- `finish`：本次调用结束（含 finish_reason 和 usage）
- `provider-error`：提供商返回的错误

### 增量事件分发

LLMEvent 被逐条分发给下游处理器。文本增量被累积合并，工具调用被解码为结构化参数，finish 事件触发 Step 结束逻辑。

## 3.6 Step 机制

**Step** 是 opencode 中 LLM 调用的基本抽象单位。一次 Step = 一次完整的 LLM API 调用，从发送请求到收到 finish_reason。

### 为什么是 Step 而非 Turn？

"Turn"通常指用户-AI 的一问一答。但在 opencode 中，一个用户消息可能触发多次 LLM 调用（因为 AI 调用工具后需要继续处理工具结果），所以"Turn"不够精确。Step 精确对应一次 API 调用，多个 Step 组成一个完整的用户请求处理过程。

### Step 的生命周期

每个 Step 经历以下阶段：

1. **Step Start**：框架发出 `step-start` Part，标记新 Step 开始。包含模型 ID、Agent 名称等元信息。

2. **Content Flow**：LLM 的流式响应到达。可能包含：
   - 文本增量（合并为 TextPart）
   - 推理增量（合并为 ReasoningPart）
   - 工具调用（解码为 ToolPart，状态为 pending）

3. **Step Finish**：LLM 返回 finish_reason。框架发出 `step-finish` Part，包含：
   - `finish_reason`：`stop`（正常结束）、`tool_calls`（AI 请求调用工具）、`length`（达到最大 Token 数）等
   - `usage`：本次调用的 Token 消耗（input、output、reasoning、cache_read、cache_write）

### 多 Step 循环

如果 finish_reason 是 `tool_calls`，框架进入工具执行阶段（见 3.7 节），工具执行完毕后，结果被注入消息历史，开启新的 Step 继续对话。这个循环持续到 AI 返回 `stop`（不再需要调用工具）或达到最大 Step 数限制。

## 3.7 工具并发调度

当 LLM 在一次响应中返回多个 tool_call 时，opencode **并行执行**这些工具调用。

### 调度流程

1. **解码**：每个 tool_call 的 JSON 参数被解码为对应工具期望的输入类型
2. **权限检查**：每个工具调用触发权限检查。如果用户尚未授权，框架暂停执行并等待用户决策（允许一次、始终允许、拒绝）
3. **并行执行**：通过权限检查的工具调用被并发执行。每个工具在自己的 Fiber 中运行
4. **结果编码**：工具执行结果被编码为 JSON（遵循工具的 success Schema）
5. **结果注入**：所有工具结果被作为 `tool_result` 消息注入对话历史，然后开启新的 Step

### 并发控制

工具执行使用 Effect 的结构化并发（Fiber）。多个工具调用同时启动，框架等待所有工具完成后才开启下一 Step。如果某个工具执行失败，其错误信息被作为 tool_result 返回给 AI，AI 可以据此调整后续行为。

## 3.8 异常兜底

opencode 在多个层面实现了异常处理：

### Provider 错误

当 LLM API 返回错误时，协议适配器将其转换为 `provider-error` 事件。错误分为：
- **可重试错误**（retryable: true）：如 503 Service Unavailable、网络超时。框架自动重试，使用指数退避策略
- **不可重试错误**（retryable: false）：如 401 Unauthorized、400 Bad Request。框架终止当前 Step，向用户报告错误

### 工具执行失败

工具执行可能因为多种原因失败：命令执行出错、文件不存在、权限不足等。工具失败时：
- 错误信息被结构化记录（ToolStateError 包含错误消息和截断的输出）
- 错误作为 tool_result 返回给 AI，AI 可以尝试其他方法或向用户说明
- 在 UI 中，失败的工具显示为错误状态（✗ 标记）

### Session 级别错误

当发生无法恢复的错误（如 Session 数据损坏、配置加载失败），框架发出 `session.error` 事件。CLI 模式下，错误信息显示给用户并退出；TUI 模式下，错误显示在界面中，用户可以选择重试或放弃。

### 超时保护

关键操作都有超时保护：
- LLM API 调用有全局超时
- 工具执行有单独的超时限制（如 Bash 命令默认 2 分钟）
- 远程指令 URL 获取有 5 秒超时

---

## 本章小结

Agent 运行循环是 opencode 的核心引擎。一次用户输入经过 Part 组装、System Prompt 动态注入、模型选择、流式 API 调用、Step 管理、工具并发调度和异常兜底，最终产生 AI 响应和文件变更。Step 作为 LLM 调用的基本单位，使得多轮工具调用循环清晰可控。下一章将深入工具系统的设计细节。

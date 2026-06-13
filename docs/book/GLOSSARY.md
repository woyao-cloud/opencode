# 术语表

全书使用的核心术语定义索引。

## A

**Agent（智能体）**
AI 助手的基本单位。每个 Agent 有独立的 System Prompt、权限配置和模型选择。Agent 分为 primary（主 Agent，用户直接调用）和 subagent（子 Agent，由主 Agent 通过 Task 工具调用）。

**AGENTS.md**
opencode 的指令文件格式。放在项目目录中的 Markdown 文件，为 AI 提供项目规范、上下文信息和行为指导。支持层级放置（根目录、子目录）。

**ApplyPatch（应用补丁工具）**
文件修改工具之一。接收 unified diff 格式的补丁，应用到目标文件。适用于 AI 生成的批量修改。

## C

**CLAUDE.md**
兼容 Claude Code 的指令文件格式。功能与 AGENTS.md 相同，确保从 Claude Code 迁移的用户可以复用已有配置。

**Compaction（压缩）**
上下文压缩机制。当对话历史过长时，用 AI 生成摘要替换原始消息，释放上下文窗口空间。压缩后的摘要保留关键决策和重要信息。

**Context（上下文）**
发送给 LLM 的完整信息集合，包括 System Prompt、指令文件、对话历史和工具执行结果。

## D

**Dynamic Tool（动态工具）**
运行时从外部来源（MCP 服务器、插件清单）加载的工具。使用原始 JSON Schema 而非 Effect Schema 定义参数。

## E

**Effect-TS**
TypeScript 的效应系统库。opencode 的核心架构依赖，提供类型安全的错误处理、依赖注入（Layer）、结构化并发（Fiber）和 Schema 系统。

**Event Bus（事件总线）**
opencode 内部的发布-订阅系统。组件通过发布和订阅 SessionEvent 来通信，实现 UI、日志、同步等模块的解耦。

## F

**Fork（分支）**
从已有 Session 的任意消息点创建新 Session 的操作。新 Session 复制原 Session 到分叉点为止的历史，之后独立发展。

## I

**Instruction File（指令文件）**
见 AGENTS.md / CLAUDE.md。

## L

**LLMEvent**
统一的 LLM 流式事件类型。各 Provider 的原生事件被协议适配器转换为 LLMEvent，包括 text-delta、reasoning-delta、tool-call、finish、provider-error 等。

**LSP（Language Server Protocol）**
语言服务器协议。opencode 集成 LSP，让 AI 可以使用跳转定义、查找引用、诊断检查等代码智能功能。

## M

**MCP（Model Context Protocol）**
AI 工具集成协议。opencode 作为 MCP 客户端，可以连接 MCP 服务器，将其工具和资源注册到框架中。

**Message（消息）**
会话中的一条完整消息。类型包括 User（用户输入）、Assistant（AI 响应）、Shell（命令执行记录）、Compaction（压缩摘要）等。

**Model（模型）**
一个具体的 LLM 实例。Model 定义包含能力声明（上下文窗口、Vision、Reasoning 支持）、成本信息和 API 配置。

## P

**Part（消息片段）**
消息的组成单位。一条 Message 包含多个 Part。Part 类型包括 TextPart、FilePart、ToolPart、ReasoningPart、StepStartPart、StepFinishPart 等。

**Permission（权限）**
工具调用的访问控制机制。权限按"权限键"分组（如 bash、edit、read），用户可以为每个权限键设置 allow/deny 规则。

**Primary Agent（主 Agent）**
Mode 为 primary 的 Agent，可以被用户直接调用。负责理解用户需求、拆解任务、派发子任务和汇总结果。

**Provider（提供商）**
LLM 服务提供商（如 Anthropic、OpenAI、AWS Bedrock）。Provider 定义包含 API 端点、协议适配器和 Model 工厂函数。

## S

**Session（会话）**
对话的基本容器。承载消息历史、上下文状态、Agent 配置和模型选择。Session 可以被创建、Fork、继续和归档。

**Skill（技能）**
可复用的 AI 行为模板。每个 Skill 是一个 Markdown 文件，包含给 AI 的详细操作指南。Skill 可以通过斜杠命令或 AI 自主选择触发。

**Step（调用步）**
一次完整的 LLM API 调用，从发送请求到收到 finish_reason。一个用户消息可能触发多个 Step（因为 AI 调用工具后需要继续处理结果）。

**Subagent（子 Agent）**
Mode 为 subagent 的 Agent，只能由主 Agent 通过 Task 工具调用。通常有更窄的专注领域和更受限的权限。

**System Prompt（系统提示）**
发送给 AI 的第一条消息，定义 AI 的角色、行为准则和能力边界。由 Agent 定义、指令文件和动态上下文组装而成。

## T

**Task（任务工具）**
多 Agent 协作的关键工具。主 Agent 通过 Task 工具将子任务派发给 Subagent，Subagent 独立执行后返回结果。

**Tool（工具）**
AI 可以调用的能力单元。每个工具有类型安全的参数/返回值定义、生命周期状态机和权限声明。内置工具包括 Bash、Read、Write、Edit、Glob、Grep、Task 等。

**Trace（追踪）**
开发专用的 JSONL 事件追踪系统。记录完整的事件流，用于调试流式顺序、权限行为和 UI 渲染问题。

**TTFT（Time To First Token）**
首 Token 延迟——从发送请求到收到第一个 AI 输出 Token 的时间。C 端体验的关键指标。

**Typed Tool（类型工具）**
编译时定义的工具。使用 Effect Schema 定义参数和返回值，提供编译时类型检查和运行时自动验证。

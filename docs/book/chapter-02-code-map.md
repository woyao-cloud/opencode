# 第 2 章 · 代码地图

## 2.1 monorepo 包结构

opencode 采用 monorepo 架构，每个包有明确的职责边界。以下是关键包的导览：

### packages/opencode —— 核心

这是框架的心脏。包含：
- **CLI 入口**（`src/cli/cmd/run.ts`）：命令行 `opencode run` 的完整实现，包括会话创建、事件循环、UI 渲染
- **会话系统**（`src/session/`）：Session 的创建、消息管理、Prompt 处理、Compaction 压缩
- **Agent 系统**（`src/agent/`）：Agent 定义、权限配置、Subagent 生成
- **工具系统**（`src/tool/`）：所有内置工具的 Schema 定义和执行逻辑
- **Provider 系统**（`src/provider/`）：模型提供商接入、消息转换、温度等参数处理
- **ACP 协议**（`src/acp/`）：Agent Communication Protocol 的实现
- **服务端**（`src/server/`）：HTTP API 服务，包括 Session、Config、File 等路由
- **TUI 终端界面**（`src/cli/cmd/tui/`）：基于 Ink/React 的终端 UI 组件树
- **配置系统**（`src/config/`）：项目级和全局配置的加载与合并

### packages/llm —— 模型抽象层

这是与 LLM 提供商通信的底层库。包含：
- **Provider 定义**（`src/provider.ts`）：Provider 和 Model 的类型定义与工厂函数
- **Tool 抽象**（`src/tool.ts`）：类型安全的工具定义，支持 Typed 和 Dynamic 两种模式
- **Tool Runtime**（`src/tool-runtime.ts`）：工具调度的运行时——接收 LLM 返回的 tool_call，解码参数，执行工具，编码结果
- **协议适配器**（`src/protocols/`）：各提供商的流式协议解析（Anthropic Messages、OpenAI Compatible Chat、Bedrock Converse）
- **流式处理**（`src/stream.ts`）：将原始 SSE 事件转换为统一的 LLMEvent 流

### packages/core —— 共享基础

跨包共享的基础类型和工具：
- **Session Event**（`src/session-event.ts`）：所有会话事件的类型定义（40+ 种事件类型）
- **Session Message**（`src/session-message.ts`）：消息的 Schema 定义（User、Assistant、Shell、Compaction 等）
- **Session Prompt**（`src/session-prompt.ts`）：用户输入的 Prompt 结构
- **Log 系统**（`src/util/log.ts`）：分级日志、Tag 机制、文件轮转
- **Global 路径**（`src/global.ts`）：跨平台的配置、数据、日志目录管理
- **File System 抽象**（`src/filesystem.ts`）：统一的文件操作接口

### packages/app —— Web 应用

基于 SolidJS 的 Web 端：
- **会话界面**（`src/pages/session/`）：消息时间线、上下文用量、Diff 展示
- **Prompt 输入**（`src/components/prompt-input/`）：文件引用、上下文项管理
- **持久化**（`src/utils/persist.ts`）：Workspace 和 Session 级别的状态持久化

### packages/sdk/js —— 客户端 SDK

自动生成的 HTTP API 客户端：
- **V2 API**（`src/v2/gen/sdk.gen.ts`）：Session、Model、Provider、File、Permission 等资源的完整 API 封装
- **类型定义**（`src/v2/`）：请求/响应的 TypeScript 类型

### 其他包

- **packages/desktop**：Electron 桌面应用
- **packages/enterprise**：企业版功能（共享会话等）
- **packages/console**：管理控制台
- **packages/containers**：容器化支持
- **packages/docs**：文档站点
- **packages/plugin**：插件 SDK
- **packages/http-recorder**：HTTP 录制/回放（用于测试）

## 2.2 关键文件路径索引

以下是理解核心流程的必读文件：

| 文件 | 功能 |
|------|------|
| `packages/opencode/src/cli/cmd/run.ts` | CLI `run` 命令的完整实现：会话创建、事件循环、UI 渲染 |
| `packages/opencode/src/session/prompt.ts` | Prompt 处理入口：消息构建、System Prompt 组装 |
| `packages/opencode/src/session/processor.ts` | 事件处理器：将 LLM 事件转换为 Message Part |
| `packages/opencode/src/session/instruction.ts` | 指令文件系统：AGENTS.md/CLAUDE.md 的发现与注入 |
| `packages/opencode/src/session/message-v2.ts` | 消息和 Part 的 V2 Schema 定义 |
| `packages/opencode/src/tool/` | 所有内置工具的 Schema 和执行逻辑 |
| `packages/opencode/src/agent/agent.ts` | Agent 系统的核心：定义、权限、生成 |
| `packages/opencode/src/provider/transform.ts` | 消息转换管道：归一化、缓存标记、Provider 适配 |
| `packages/opencode/src/provider/provider.ts` | Provider 和 Model 的管理 |
| `packages/llm/src/tool.ts` | 工具抽象：类型安全的工具定义 |
| `packages/llm/src/tool-runtime.ts` | 工具运行时：调度、解码、执行、编码 |
| `packages/llm/src/protocols/` | 各提供商的流式协议适配器 |
| `packages/core/src/session-event.ts` | 所有会话事件的类型定义 |
| `packages/core/src/session-message.ts` | 消息的 Schema 定义 |
| `packages/core/src/util/log.ts` | 日志系统实现 |
| `packages/opencode/src/cli/cmd/run/tool.ts` | 工具 UI 渲染规则注册表 |
| `packages/opencode/src/cli/cmd/run/trace.ts` | 开发用 JSONL 事件追踪 |
| `packages/opencode/src/cli/cmd/run/runtime.ts` | 运行时生命周期管理 |

## 2.3 数据流向总览

从用户输入到 AI 响应再到文件变更，数据在 opencode 中经历以下关键节点：

```text
用户输入 (自然语言 + 文件引用)
    │
    ▼
┌─────────────────────────────────┐
│ Session.prompt()                 │  ← 会话 API 入口
│  · 组装 Part (文本/文件/Agent)   │
│  · 解析斜杠命令 (/compact 等)    │
│  · 确定 Model 和 Agent           │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Prompt Handler                   │  ← 消息构建
│  · 加载 System Prompt            │
│  · 注入指令文件 (AGENTS.md 等)    │
│  · 构建 Message 列表             │
│  · 检测上下文溢出 → 触发压缩     │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Provider Transform               │  ← 消息转换
│  · 移除不支持的 Part 类型        │
│  · 归一化消息结构                │
│  · 注入 Anthropic Cache 标记     │
│  · 重映射 Provider Options       │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ LLM Stream                       │  ← API 调用
│  · 发送 HTTP 请求到模型 API      │
│  · 解析 SSE 流 → LLMEvent        │
│  · text-delta / reasoning-delta  │
│  · tool-call / finish            │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ Processor                        │  ← 事件处理
│  · LLMEvent → Message Part       │
│  · 文本增量合并                  │
│  · 工具调用解码                  │
│  · Step 生命周期管理             │
└─────────────────────────────────┘
    │
    ├── 有 tool_call? ──→ ┌──────────────────┐
    │                      │ Tool Runtime      │
    │                      │  · 解码参数       │
    │                      │  · 权限检查       │
    │                      │  · 执行工具       │
    │                      │  · 编码结果       │
    │                      └──────────────────┘
    │                              │
    │                              ▼ (工具结果注入下一轮 Step)
    │
    ▼ (无 tool_call，finish)
┌─────────────────────────────────┐
│ UI / Event Bus                  │  ← 输出
│  · TUI 终端渲染                 │
│  · Web 应用更新                 │
│  · 事件持久化                   │
│  · 日志 / Trace 记录            │
└─────────────────────────────────┘
```

这个流程中的每个关键节点都将在后续章节中详细展开。

---

## 本章小结

opencode 的代码组织遵循清晰的分层架构：llm 包提供底层模型通信，core 包提供共享类型和工具，opencode 包在此基础上构建完整的 Agent 框架，app 和 desktop 包提供面向用户的界面。数据从用户输入开始，经过会话 API、消息构建、Provider 转换、LLM 调用、事件处理、工具执行，最终到达 UI 和日志系统。理解这个主流程是理解全书后续章节的基础。

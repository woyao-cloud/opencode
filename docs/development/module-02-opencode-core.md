# 模块 2 · opencode 核心包详解

`packages/opencode` 是框架的心脏，包含 40+ 个子目录。本章逐一介绍每个子目录的职责、关键文件和使用方式。

## 2.1 目录总览

```text
packages/opencode/src/
├── cli/           # 命令行入口与 TUI 终端界面
├── session/       # 会话系统：Prompt、Message、Compaction
├── agent/         # Agent 定义、权限、生成
├── tool/          # 工具实现（Bash、Read、Write、Task 等）
├── provider/      # 模型提供商接入与消息转换
├── server/        # HTTP API 服务端
├── acp/           # Agent Communication Protocol
├── sync/          # 事件同步与持久化
├── config/        # 配置加载与管理
├── project/       # 项目实例管理
├── bus/           # 事件总线
├── effect/        # Effect-TS 运行时与桥接
├── lsp/           # LSP 语言服务器集成
├── mcp/           # MCP 协议客户端
├── plugin/        # 插件加载与管理
├── skill/         # Skill 系统
├── command/       # 斜杠命令系统
├── permission/    # 权限控制
├── auth/          # 认证与授权
├── account/       # 账户管理
├── file/          # 文件操作（Ripgrep 封装等）
├── git/           # Git 操作封装
├── shell/         # Shell/PTY 执行
├── pty/           # 伪终端管理
├── snapshot/      # 文件快照
├── patch/         # 补丁生成与应用
├── worktree/      # Git Worktree 管理
├── background/    # 后台任务管理
├── installation/  # 安装与引导
├── ide/           # IDE 集成
├── image/         # 图片处理
├── format/        # 输出格式化
├── env/           # 环境变量管理
├── id/            # ID 生成
├── question/      # 用户提问工具
├── reference/     # 文件引用解析
├── share/         # 会话共享
├── storage/       # 本地存储抽象
├── control-plane/ # 控制平面（Workspace 管理）
├── v2/            # V2 协议相关
└── util/          # 通用工具函数
```

## 2.2 CLI 层（`cli/`）

CLI 层是 opencode 的命令行入口，包含命令定义、TUI 终端界面和运行时管理。

### 关键文件

| 文件 | 职责 |
|------|------|
| `cli/cmd/run.ts` | `opencode run` 命令的完整实现：会话创建、事件循环、UI 渲染、权限处理 |
| `cli/cmd/run/runtime.ts` | 运行时生命周期：本地模式、Attach 模式、Session 解析 |
| `cli/cmd/run/tool.ts` | 工具 UI 渲染规则注册表（TOOL_RULES） |
| `cli/cmd/run/trace.ts` | 开发用 JSONL 事件追踪 |
| `cli/cmd/run/footer.view.tsx` | 终端 Footer 状态栏组件 |
| `cli/cmd/agent.ts` | `opencode agent` 命令：Agent 的创建、列表 |
| `cli/cmd/tui/` | TUI 终端界面完整组件树（路由、对话框、主题、配置） |
| `cli/effect-cmd.ts` | Effect-TS 封装的命令定义工具 |

### 使用方式

- **添加新 CLI 命令**：在 `cli/cmd/` 下创建新文件，使用 `effectCmd()` 或 `cmd()` 定义命令，在上级命令的 `builder` 中注册
- **修改工具 UI 渲染**：编辑 `cli/cmd/run/tool.ts` 中的 `TOOL_RULES` 注册表
- **添加 TUI 路由**：在 `cli/cmd/tui/routes/` 下创建新路由组件

## 2.3 会话系统（`session/`）

会话系统是 opencode 最核心的子系统，管理从用户输入到 AI 响应的完整流程。

### 关键文件

| 文件 | 职责 |
|------|------|
| `session/prompt.ts` | Prompt 处理入口：消息构建、System Prompt 组装、上下文溢出检测 |
| `session/processor.ts` | 事件处理器：将 LLMEvent 转换为 Message Part |
| `session/message-v2.ts` | V2 协议的消息和 Part Schema 定义 |
| `session/instruction.ts` | 指令文件系统：AGENTS.md/CLAUDE.md 的发现、加载、注入 |
| `session/compaction.ts` | 上下文压缩：摘要生成、消息替换 |
| `session/schema.ts` | Session 相关的 Schema 和 ID 类型 |
| `session/message-updater.ts` | 消息状态更新器（memory adapter 模式） |

### 核心流程

```
用户输入 → Session.prompt()
  → 组装 Part（文本/文件/Agent 引用）
  → 加载 System Prompt（Agent 定义 + 指令文件 + 远程 URL）
  → 构建 Message 列表
  → 检测上下文溢出 → 触发 Compaction
  → 发送 LLM 请求
  → 接收流式响应 → Processor 转换为 Part
  → 工具调用 → Tool Runtime 执行
  → 结果注入 → 下一轮 Step
  → 最终响应 → UI 渲染
```

### 使用方式

- **修改 Prompt 构建逻辑**：编辑 `session/prompt.ts`
- **添加新 Part 类型**：在 `session/message-v2.ts` 中定义 Schema，在 Processor 中处理
- **修改指令文件发现逻辑**：编辑 `session/instruction.ts`

## 2.4 Agent 系统（`agent/`）

Agent 系统管理 AI 助手的定义、权限和生命周期。

### 关键文件

| 文件 | 职责 |
|------|------|
| `agent/agent.ts` | Agent 核心：定义加载、列表、生成（LLM 辅助创建） |
| `agent/subagent-permissions.ts` | Subagent 权限继承与隔离逻辑 |

### Agent 定义结构

每个 Agent 定义包含：identifier（唯一名）、description（描述）、whenToUse（使用场景）、mode（primary/subagent/all）、systemPrompt（System Prompt 模板）、permission（权限配置）、model（推荐模型）。

### 使用方式

- **添加内置 Agent**：在 `agent/` 目录下创建定义文件
- **自定义 Agent**：通过 `opencode agent create` 命令生成，或手动在 `.opencode/agents/` 下创建 YAML/Markdown 文件
- **修改 Agent 权限**：编辑 Agent 定义中的 `permission` 字段

## 2.5 工具系统（`tool/`）

工具系统包含所有内置工具的 Schema 定义和执行逻辑。

### 关键文件

| 文件 | 职责 |
|------|------|
| `tool/bash.ts` | Bash/Shell 命令执行 |
| `tool/read.ts` | 文件读取（含图片、PDF） |
| `tool/write.ts` | 文件创建/覆写 |
| `tool/edit.ts` | 精确字符串替换编辑 |
| `tool/apply-patch.ts` | Unified diff 补丁应用 |
| `tool/glob.ts` | 文件模式匹配搜索 |
| `tool/grep.ts` | 内容搜索（Ripgrep） |
| `tool/task.ts` | 子 Agent 派发 |
| `tool/question.ts` | 向用户提问 |
| `tool/todo.ts` | 任务列表管理（TodoWrite） |
| `tool/webfetch.ts` | Web 页面获取 |
| `tool/websearch.ts` | Web 搜索 |
| `tool/lsp.ts` | LSP 语言服务器操作 |
| `tool/skill.ts` | Skill 调用 |
| `tool/plan-exit.ts` | Plan 模式退出 |
| `tool/truncate.ts` | 工具输出截断 |
| `tool/shell.ts` | Shell 环境处理 |
| `tool/tool.ts` | 工具基础类型定义 |
| `tool/registry.ts` | 工具注册表 |

### 工具定义模式

每个工具文件导出：
- **Schema 定义**：`parameters`（输入）和 `success`（输出）的 Effect Schema
- **执行函数**：`execute` 函数，接收解码后的参数，返回 Effect 封装的执行结果
- **元数据**：工具描述、权限键

### 使用方式

- **添加新工具**：在 `tool/` 下创建新文件，定义 Schema 和 execute 函数，在 `tool/registry.ts` 中注册
- **修改工具行为**：编辑对应工具的 execute 函数
- **调整截断策略**：编辑 `tool/truncate.ts`

## 2.6 Provider 系统（`provider/`）

Provider 系统负责模型提供商的接入、消息转换和参数管理。

### 关键文件

| 文件 | 职责 |
|------|------|
| `provider/provider.ts` | Provider 和 Model 的管理、解析、选择 |
| `provider/transform.ts` | 消息转换管道：归一化、缓存标记、Provider Options 重映射 |
| `provider/sdk/` | AI SDK 提供商适配器（Anthropic、OpenAI、Bedrock 等） |

### 使用方式

- **添加新 Provider**：在 `provider/sdk/` 下创建适配器，在 `provider/provider.ts` 中注册
- **修改消息转换逻辑**：编辑 `provider/transform.ts`

## 2.7 服务端（`server/`）

HTTP API 服务端，提供 Session、Config、File、Permission 等 REST API。

### 关键文件

| 文件 | 职责 |
|------|------|
| `server/server.ts` | 服务端入口与路由注册 |
| `server/routes/instance/` | 实例级别路由（Session、Config、File、Permission、MCP 等） |
| `server/routes/instance/httpapi/` | HTTP API 实现（Handler + Middleware） |
| `server/shared/fence.ts` | 并发请求栅栏（防止竞态条件） |

### 使用方式

- **添加新 API 端点**：在 `server/routes/instance/httpapi/handlers/` 下创建 Handler，在路由中注册
- **添加中间件**：在 `server/routes/instance/httpapi/middleware/` 下创建

## 2.8 ACP 协议（`acp/`）

Agent Communication Protocol 的实现——open code 与外部 Agent 客户端之间的标准通信协议。

### 关键文件

| 文件 | 职责 |
|------|------|
| `acp/agent.ts` | ACP Agent 实现：Prompt 处理、Session 管理、连接管理 |
| `acp/runtime.ts` | ACP 运行时：Agent 注册、连接创建 |

## 2.9 其他重要子目录

### `sync/` — 事件同步

将 SessionEvent 持久化到 SQLite，支持多消费者订阅。`sync/index.ts` 定义了事件定义（Definition）和投影器（Projector）的注册机制。

### `config/` — 配置管理

加载和合并多层配置：全局配置（`~/.config/opencode/`）→ 项目配置（`.opencode/`）→ 环境变量 → 命令行参数。

### `project/` — 项目实例

管理项目实例的创建、加载和上下文。`instance-context.ts` 定义了 InstanceContext（directory、worktree、project info），`instance-store.ts` 管理实例的持久化。

### `bus/` — 事件总线

发布-订阅模式的事件系统。`bus-event.ts` 定义了事件定义格式，各模块通过 Event Bus 解耦通信。

### `effect/` — Effect 运行时

Effect-TS 与 opencode 的桥接层。`app-runtime.ts` 是应用运行时的入口，`bridge.ts` 处理 Workspace 上下文恢复，`instance-state.ts` 管理实例级别的状态。

### `lsp/` — LSP 集成

语言服务器的自动发现、安装、启动和通信。`server.ts` 包含 20+ 种语言服务器的定义。

### `mcp/` — MCP 客户端

Model Context Protocol 的客户端实现，支持工具和资源的动态加载。

### `plugin/` — 插件系统

插件的加载、验证和生命周期管理。支持 TUI 插件和工具插件。

### `skill/` — Skill 系统

可复用 AI 行为模板的加载和注入。Skill 可以从项目级别和全局级别加载。

### `command/` — 命令系统

斜杠命令（`/compact`、`/agent` 等）的定义和处理。

### `permission/` — 权限控制

工具调用的权限检查、规则匹配和用户交互。

### `file/` — 文件操作

Ripgrep 封装（`ripgrep.ts`）、文件搜索、文件系统操作。

### `git/` — Git 操作

Git 命令的封装：diff、log、status、commit 等。

### `shell/` — Shell 执行

Shell 命令的执行环境管理、环境变量处理。

### `pty/` — 伪终端

PTY（伪终端）的管理，用于提供完整的终端体验。

### `snapshot/` — 文件快照

文件状态的快照记录，用于追踪 AI 修改前后的文件内容。

### `patch/` — 补丁

Unified diff 格式补丁的生成和应用。

### `worktree/` — Git Worktree

Git Worktree 的创建和管理，用于隔离的并行工作环境。

### `background/` — 后台任务

后台任务的管理：启动、监控、终止。

### `storage/` — 本地存储

SQLite 和文件系统的存储抽象层。

### `control-plane/` — 控制平面

Workspace 管理、Workspace 上下文提供。

### `util/` — 通用工具

LocalContext（Effect 上下文管理）、Filesystem 工具、Locale 格式化等。

---

## 本章小结

`packages/opencode` 包含 40+ 个子目录，覆盖 CLI、会话、Agent、工具、Provider、服务端、ACP、同步、配置、LSP、MCP、插件、Skill 等全部核心功能。理解每个子目录的职责和关键文件，是接手 opencode 开发的基础。

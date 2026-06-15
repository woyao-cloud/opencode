# OpenCode 系统功能说明文档

## 1. 项目定位

OpenCode 是一个终端优先的 AI 辅助编码工具，提供 CLI 交互界面（TUI）、Web 界面、桌面应用（Electron）和企业级部署等多种使用方式。核心能力是通过大语言模型（LLM）驱动代码理解、编辑、审查和项目管理。

- **仓库**：<https://github.com/anomalyco/opencode>
- **语言**：TypeScript（Bun 运行时）
- **框架**：Effect v4（函数式并发）、SolidJS（UI）、Drizzle ORM（数据库）
- **构建系统**：Turbo 2.8.13（Monorepo）
- **包数量**：28 个（22 个顶级目录 + 子包）

---

## 2. 产品全景能力

### 2.1 核心 AI 能力

| 能力 | 说明 |
|------|------|
| 代码生成 | 自然语言描述 → 代码文件创建/修改 |
| 代码理解 | 全局搜索+代码库分析+依赖追踪 |
| 代码审查 | 差异对比、审查流程、自动化建议 |
| Bug 修复 | 定位问题 → 生成补丁 → 验证 |
| 重构 | 安全重构、重命名、提取函数等 |
| 文档生成 | 代码注释、README、API 文档自动生成 |
| Git 操作 | 提交信息生成、PR 创建、代码审查 |
| 多步骤编排 | Agent 自主推理 + 工具调用循环 |
| 项目管理 | 会话管理、项目历史、回滚 |

### 2.2 CLI 命令体系

`packages/opencode/src/index.ts` 使用 yargs 注册了 20+ 子命令：

| 命令 | 模块 (`src/cli/cmd/`) | 说明 |
|------|----------------------|------|
| `run` | `run.ts` | 默认交互模式，启动 TUI 会话 |
| `generate` | `generate.ts` | 单次代码生成（非交互） |
| `agent` | `agent.ts` | Agent 管理（列出/选择） |
| `serve` | `serve.ts` | 启动 HTTP API 服务器 |
| `web` | `web.ts` | 启动 Web UI 服务器 |
| `session` | `session.ts` | 会话管理（列表/查看/删除） |
| `mcp` | `mcp.ts` | MCP 协议服务器/客户端管理 |
| `acp` | `acp.ts` | Agent Communication Protocol |
| `debug` | `debug.ts` | 调试诊断 |
| `stats` | `stats.ts` | 使用统计 |
| `export`/`import` | `export.ts`/`import.ts` | 会话导入导出 |
| `github` | `github.ts` | GitHub 集成 |
| `pr` | `pr.ts` | PR 管理 |
| `db` | `db.ts` | 数据库管理 |
| `account` | `account.ts` | 账户/认证管理 |
| `providers` | `providers.ts` | AI 提供商配置 |
| `models` | `models.ts` | 模型管理 |
| `plugin` | `plug.ts` | 插件管理 |
| `upgrade` | `upgrade.ts` | 版本升级 |
| `uninstall` | `uninstall.ts` | 卸载 |

### 2.3 AI 提供商支持

20+ 提供商通过 `@ai-sdk/*` 和 `@opencode-ai/llm` 抽象层支持：

**LLM Package 原生协议实现** (`packages/llm/src/protocols/`)：
- OpenAI Chat Completions
- OpenAI Responses API
- Anthropic Messages API
- Google Gemini
- AWS Bedrock Converse
- OpenAI-compatible Chat

**AI SDK 集成** (`packages/opencode`)：
- Azure OpenAI
- Groq, Mistral, Cohere
- Perplexity, xAI (Grok)
- Together AI, DeepInfra
- Cerebras, Alibaba
- OpenRouter
- GitHub Copilot
- GitLab Workflow

### 2.4 工具系统（Tool System）

`packages/opencode/src/tool/` 内置 20+ 工具：

| 工具 | 文件 | 功能 |
|------|------|------|
| `read` | `read.ts` | 读取文件内容 |
| `write` | `write.ts` | 写入/修改文件 |
| `edit` | `edit.ts` | 精确代码编辑 |
| `glob` | `glob.ts` | 文件模式匹配搜索 |
| `grep` | `grep.ts` | 代码内容搜索 |
| `shell` | `shell.ts` | Shell 命令执行 |
| `apply_patch` | `apply_patch.ts` | 应用代码补丁 |
| `task` | `task.ts` | 子任务管理 |
| `todo` | `todo.ts` | TODO 跟踪 |
| `question` | `question.ts` | 用户提问 |
| `webfetch` | `webfetch.ts` | 网页抓取 |
| `websearch` | `websearch.ts` | 网络搜索 |
| `plan` | `plan.ts` | 计划生成 |
| `skill` | `skill.ts` | 技能执行 |
| `lsp` | `lsp.ts` | LSP 集成 |
| `repo_clone` | `repo_clone.ts` | 仓库克隆 |
| `repo_overview` | `repo_overview.ts` | 仓库概览 |
| `task_status` | `task_status.ts` | 任务状态查询 |
| `truncate` | `truncate.ts` | 上下文裁剪 |
| `mcp-websearch` | `mcp-websearch.ts` | MCP 网络搜索 |

### 2.5 插件系统

`packages/plugin` 定义完整的钩子系统（Hooks）：

| 钩子分类 | 钩子列表 |
|---------|---------|
| 工具注册 | `tool` |
| 认证 | `auth` (oauth/api) |
| 提供商 | `provider` |
| 会话事件 | `event` |
| 配置 | `config` |
| 聊天消息 | `chat.message`, `chat.params`, `chat.headers` |
| 工具执行 | `tool.execute.before`, `tool.execute.after` |
| 命令执行 | `command.execute.before` |
| Shell 环境 | `shell.env` |
| 权限 | `permission.ask` |
| 实验性 | `experimental.chat.messages.transform`, `experimental.chat.system.transform`, `experimental.session.compacting`, `experimental.compaction.autocontinue`, `experimental.text.complete` |

### 2.6 TUI 插件系统

`packages/plugin/src/tui.ts` 为终端 UI 插件提供：
- 应用、注意力、快捷键、键映射、路由管理
- UI 组件：Dialog, Prompt, Toast
- 插槽系统（Slot）：注入 UI 到宿主
- 状态管理（KV Store）

---

## 3. 用户使用场景

### 场景一：交互式代码开发
```
用户输入需求 → Agent 理解 → 生成计划 → 读取文件 → 修改代码 → 用户确认
```
涉及：CLI (`run`) → Session → Agent → LLM → Tools (read/write/edit/glob/grep)

### 场景二：批量代码审查
```
opencode pr review → 获取 PR diff → LLM 分析 → 生成审查意见
```
涉及：CLI (`pr`) → Git → LLM → Session

### 场景三：Web UI 使用
```
opencode web → 启动服务器 → 浏览器打开 → SolidJS SPA → SDK 通信
```
涉及：CLI (`web`) → Server → SDK → App (SolidJS)

### 场景四：桌面应用
```
Electron 启动 → 主进程（Node.js） → 渲染进程（SolidJS）
```
涉及：Desktop Main → Sidecar Server → Renderer (App)

### 场景五：企业级部署
```
Cloudflare Worker → Hono API → SolidJS Start SSR
```
涉及：Enterprise (SolidJS Start) → Core → UI

### 场景六：SaaS 管理控制台
```
浏览器 → Cloudflare → Console App → Stripe 计费 → 团队管理
```
涉及：Console App → Console Core → Database → Stripe

### 场景七：Slack 集成
```
Slack 消息 → @Slack/bolt → SDK Client → OpenCode Server
```
涉及：Slack App → SDK → Server (Serve)

---

## 4. 功能模块总览

```
opencode（核心 CLI/TUI）
├── cli/           CLI 命令解析和 UI 渲染
├── session/       会话管理（创建、fork、消息、压缩）
├── agent/         Agent 定义、选择和编排
├── tool/          工具系统（20+ 内置工具）
├── provider/      AI 提供商管理
├── config/        配置系统
├── server/        HTTP API 服务器
├── git/           Git 集成
├── mcp/           Model Context Protocol
├── lsp/           Language Server Protocol
├── plugin/        插件加载和 Pipe
├── storage/       SQLite 数据库层
├── auth/          认证管理
├── permission/    权限系统
├── bus/           事件总线
├── snapshot/      文件快照
├── sync/          同步引擎
├── shell/         Shell 执行
├── project/       项目管理
├── pty/           PTY 终端
├── skill/         技能系统
├── image/         图片处理
├── format/        格式化
├── question/      用户提问
├── effect/        Effect 工具函数
├── reference/     引用管理
├── share/         分享功能
├── background/    后台任务
├── worktree/      工作树
├── control-plane/ 控制平面
├── account/       账户
├── acp/           ACP 协议
└── event-v2-bridge/  事件 v2 桥接

@opencode-ai/core（核心库）
├── session.ts/c         会话数据模型
├── session-event.ts/c   会话事件定义
├── session-message.ts/c 会话消息类型
├── model.ts             模型类型
├── models.ts            模型目录
├── provider.ts          提供商类型
├── auth.ts              认证助手
├── filesystem.ts        文件系统抽象
├── process.ts          进程管理
├── event.ts              事件系统
├── schema.ts              通用 Schema
├── plugin.ts              Plugin 定义
└── ...

@opencode-ai/llm（LLM 抽象层）
├── schema/                 核心数据模型（消息、事件、选项、错误）
├── route/                路由框架（Protocol/Endpoint/Auth/Framing/Transport）
├── protocols/              协议实现（OpenAI/Anthropic/Gemini/Bedrock）
├── providers/               提供商配置
├── llm.ts                LLM 便利层
├── tool.ts               工具定义
├── tool-runtime.ts       工具运行时
└── cache-policy.ts       缓存策略

@opencode-ai/ui（共享 UI 组件库）
├── 185+ SolidJS 组件
├── Tailwind CSS 样式
└── Storybook 文档

@opencode-ai/app（Web UI 应用）
├── pages/                页面（Home、Session）
├── components/           业务组件（37 个目录）
├── context/              状态管理（15+ Provider）
├── hooks/                自定义 Hooks
└── i18n/                 国际化

@opencode-ai/desktop（桌面应用）
├── main/                 Electron 主进程
├── preload/              IPC 桥接
└── renderer/             渲染进程

@opencode-ai/sdk（SDK）
├── client.ts             v1 客户端
├── server.ts             v1 服务器
└── v2/                   v2 API（从 OpenAPI 生成）
```
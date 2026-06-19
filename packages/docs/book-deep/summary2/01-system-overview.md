# OpenCode 系统功能说明文档

## 1. 项目定位

OpenCode 是一个终端优先的 AI 辅助编码工具，提供 CLI/TUI 交互界面、Web 界面、桌面应用（Electron）和企业级部署等多种使用方式。核心能力是通过大语言模型（LLM）驱动代码理解、编辑、审查和项目管理。

- **仓库**：<https://github.com/anomalyco/opencode>
- **语言**：TypeScript（Bun 1.3.13 运行时）
- **框架**：Effect v4（函数式并发与依赖注入）、SolidJS（响应式 UI）、Drizzle ORM（数据库）、Hono（HTTP 服务）
- **构建系统**：Turbo 2.8.13（Monorepo）
- **包数量**：22+ 工作区包
- **许可证**：MIT

---

## 2. 产品全景能力

### 2.1 核心 AI 能力矩阵

| 能力 | 说明 | 涉及模块 |
|------|------|----------|
| 代码生成 | 自然语言描述 → 代码文件创建/修改 | `session/`, `tool/edit`, `tool/create` |
| 代码理解 | 全局搜索 + 代码库分析 + 依赖追踪 | `tool/grep`, `tool/read`, `tool/glob`, `tool/agent` |
| 代码审查 | 差异对比、审查流程、自动化建议 | `tool/diff`, `session/`, `git/` |
| Bug 修复 | 定位问题 → 生成补丁 → 验证 | `session/processor`, `tool/edit`, `tool/bash` |
| 安全重构 | 重命名、提取函数、AST 感知重构 | `tool/lsp`, `tool/edit` |
| 文档生成 | 代码注释、README、API 文档 | `session/`, `tool/create` |
| Git 操作 | 提交信息生成、PR 创建、代码审查 | `git/`, `tool/bash` |
| 多步骤编排 | Agent 自主推理 + 工具调用循环 | `session/processor`, `agent/` |
| 项目管理 | 会话管理、项目历史、回滚 | `session/`, `storage/` |
| MCP 集成 | 通过 MCP 协议连接外部工具 | `mcp/` |
| 插件系统 | 自定义 TUI 插件和功能扩展 | `plugin/`, `@opencode-ai/plugin` |
| 多模型支持 | 20+ AI 提供商统一接口 | `provider/`, `@opencode-ai/llm`, `@opencode-ai/core/aisdk` |

### 2.2 CLI 命令体系

入口文件 `packages/opencode/src/index.ts`（yargs 框架）注册了 20+ 子命令：

| 命令 | 模块 (`src/cli/cmd/`) | 说明 |
|------|----------------------|------|
| `run` | `run.ts` | 默认交互模式，启动 TUI 或非交互会话 |
| `generate` | `generate.ts` | 单次代码生成（非交互模式） |
| `agent` | `agent.ts` | Agent 管理（列出、选择、配置） |
| `serve` | `serve.ts` | 启动 HTTP API 服务器 |
| `web` | `web.ts` | 启动 Web UI 服务器 |
| `session` | `session.ts` | 会话管理（列表、查看、删除） |
| `mcp` | `mcp.ts` | MCP 协议服务器/客户端管理 |
| `acp` | `acp.ts` | Agent Communication Protocol |
| `debug` | `debug.ts` | 调试诊断工具 |
| `stats` | `stats.ts` | 使用统计 |
| `export` | `export.ts` | 会话数据导出 |
| `import` | `import.ts` | 会话数据导入 |
| `github` | `github.ts` | GitHub 集成（issues、PR） |
| `pr` | `pr.ts` | PR 管理（创建、审查、合并） |
| `db` | `db.ts` | 数据库管理（迁移、查询） |
| `account` | `account.ts` | 账户/认证管理 |
| `providers` | `providers.ts` | AI 提供商配置 |
| `models` | `models.ts` | 模型管理与基准测试 |
| `plugin` | `plug.ts` | 插件管理（安装、列出、移除） |
| `upgrade` | `upgrade.ts` | 版本升级自动更新 |
| `uninstall` | `uninstall.ts` | 卸载清理 |

### 2.3 AI 提供商支持

通过 `@ai-sdk/*` 和 `@opencode-ai/llm` 抽象层支持 20+ 提供商：

| 提供商 | SDK 包 | 类型 |
|--------|--------|------|
| Anthropic (Claude) | `@ai-sdk/anthropic` | 原生 |
| OpenAI (GPT) | `@ai-sdk/openai` | 原生 |
| Google Gemini | `@ai-sdk/google` | 原生 |
| Google Vertex AI | `@ai-sdk/google-vertex` | 原生 |
| Mistral | `@ai-sdk/mistral` | 原生 |
| Cohere | `@ai-sdk/cohere` | 原生 |
| Groq | `@ai-sdk/groq` | 原生 |
| Perplexity | `@ai-sdk/perplexity` | 原生 |
| Azure OpenAI | `@ai-sdk/azure` | 原生 |
| AWS Bedrock | `@ai-sdk/amazon-bedrock` | 原生 |
| 阿里云通义千问 | `@ai-sdk/alibaba` | 原生 |
| Cerebras | `@ai-sdk/cerebras` | 原生 |
| DeepInfra | `@ai-sdk/deepinfra` | 原生 |
| Together AI | `@ai-sdk/togetherai` | 原生 |
| xAI (Grok) | `@ai-sdk/xai` | 原生 |
| AI Gateway | `@ai-sdk/gateway` | 网关 |
| OpenAI Compatible | `@ai-sdk/openai-compatible` | 兼容层 |
| OpenRouter | `@openrouter/ai-sdk-provider` | 路由 |
| Venice AI | `venice-ai-sdk-provider` | 原生 |
| GitLab AI | `gitlab-ai-provider` | 原生 |
| AI Gateway Provider | `ai-gateway-provider` | 网关 |

### 2.4 多平台支持

| 平台 | 包路径 | 技术栈 | 说明 |
|------|--------|--------|------|
| CLI/TUI | `packages/console/` | SolidJS + OpenTUI | 终端内交互式开发 |
| Web UI | `packages/app/` + `packages/web/` | SolidJS + Vite + TailwindCSS | 浏览器端开发界面 |
| Desktop | `packages/desktop/` | Electron | 桌面原生应用 |
| HTTP API | `packages/opencode/src/server/` | Hono | RESTful API 服务 |
| Storybook | `packages/storybook/` | Storybook | UI 组件开发与展示 |
| Slack | `packages/slack/` | Slack API | 团队协作集成 |

---

## 3. 关键业务流程时序图

### 3.1 交互式代码生成流程

用户输入自然语言描述 → 系统理解 → 生成代码 → 应用修改：

```
User              CLI/TUI            SDK Client          SessionProcessor        LLM.Service         ToolSystem         FileSystem
 │                  │                   │                     │                     │                   │                  │
 │ opcode run       │                   │                     │                     │                   │                  │
 │─────────────────▶│                   │                     │                     │                   │                  │
 │                  │ session.create()  │                     │                     │                   │                  │
 │                  │──────────────────▶│                     │                     │                   │                  │
 │                  │                   │──── create ────────▶│                     │                   │                  │
 │  输入: "创建 React 组件" │              │                     │                     │                   │                  │
 │─────────────────▶│                   │                     │                     │                   │                  │
 │                  │ prompt(message)   │                     │                     │                   │                  │
 │                  │──────────────────▶│──── handle() ──────▶│                     │                   │                  │
 │                  │                   │                     │  llm.stream()       │                   │                  │
 │                  │                   │                     │────────────────────▶│                   │                  │
 │                  │                   │                     │                     │  provider.stream() │                  │
 │                  │                   │                     │                     │───────────────────▶│                  │
 │                  │                   │                     │◀── textDelta ◀─────│                   │                  │
 │                  │◀── stream ◀──────│◀── stream ◀────────│                     │                   │                  │
 │◀── 实时显示流 ────│                   │                     │                     │                   │                  │
 │                  │                   │                     │  tool_call: create   │                   │                  │
 │                  │                   │                     │────────────────────▶│  tool.execute()   │                  │
 │                  │                   │                     │                     │──────────────────▶│  writeFile()    │
 │                  │                   │                     │                     │◀── ok ◀───────────│◀── ok ◀────────│
 │                  │                   │                     │◀── tool_result ◀────│                   │                  │
 │                  │                   │                     │                     │                   │                  │
 │                  │                   │                     │  llm.stream()       │                   │                  │
 │                  │                   │                     │    (继续)            │                   │                  │
 │                  │                   │                     │────────────────────▶│                   │                  │
 │                  │◀── complete ◀────│◀── complete ◀──────│                     │                   │                  │
 │◀── 显示结果 ─────│                   │                     │                     │                   │                  │
```

### 3.2 Bug 修复流程

```
User              CLI/TUI            SessionProcessor        LLM             Tool(read/grep)     Tool(edit)        Tool(bash/test)
 │                  │                     │                   │                  │                  │                  │
 │ "修复这个 bug"   │                     │                   │                  │                  │                  │
 │─────────────────▶│                     │                   │                  │                  │                  │
 │                  │  handle()           │                   │                  │                  │                  │
 │                  │────────────────────▶│                   │                  │                  │                  │
 │                  │                     │ stream()          │                  │                  │                  │
 │                  │                     │──────────────────▶│                  │                  │                  │
 │                  │                     │                   │ tool_call: grep   │                  │                  │
 │                  │                     │◀──────────────────│─────────────────▶│                  │                  │
 │                  │                     │                   │                  │ 搜索相关代码      │                  │
 │                  │                     │                   │◀── result ◀─────│                  │                  │
 │                  │                     │ stream() 继续     │                  │                  │                  │
 │                  │                     │──────────────────▶│                  │                  │                  │
 │                  │                     │                   │ tool_call: read   │                  │                  │
 │                  │                     │◀──────────────────│─────────────────▶│                  │                  │
 │                  │                     │                   │◀── code ◀───────│                  │                  │
 │                  │                     │ stream() 继续     │                  │                  │                  │
 │                  │                     │──────────────────▶│                  │                  │                  │
 │                  │                     │                   │ tool_call: edit   │                  │                  │
 │                  │                     │◀──────────────────│─────────────────▶│─────────────────▶│                  │
 │                  │                     │                   │                  │                  │ 应用修改          │
 │                  │                     │                   │◀── ok ◀─────────│◀── ok ◀──────────│                  │
 │                  │                     │ stream() 继续     │                  │                  │                  │
 │                  │                     │──────────────────▶│                  │                  │                  │
 │                  │                     │                   │ tool_call: bash   │                  │                  │
 │                  │                     │◀──────────────────│─────────────────▶│─────────────────▶│─────────────────▶│
 │                  │                     │                   │                  │                  │  运行测试验证     │
 │                  │                     │                   │◀── pass ◀───────│◀── pass ◀────────│◀── pass ◀───────│
 │                  │                     │                   │                  │                  │                  │
 │                  │◀── complete ◀──────│                   │                  │                  │                  │
 │◀── "Bug 已修复"  │                     │                   │                  │                  │                  │
```

### 3.3 多平台部署模式

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Deployment Modes                            │
├─────────────────┬─────────────────┬─────────────────┬───────────────┤
│    Local CLI    │    HTTP Server  │    Web UI       │   Desktop     │
│                 │                 │                 │   (Electron)  │
│  ┌───────────┐  │  ┌───────────┐  │  ┌───────────┐  │  ┌─────────┐  │
│  │ TUI       │  │  │ Hono HTTP │  │  │ Browser   │  │  │Electron │  │
│  │ (SolidJS) │  │  │ Server    │  │  │ (SolidJS) │  │  │Window   │  │
│  └─────┬─────┘  │  └─────┬─────┘  │  └─────┬─────┘  │  └────┬────┘  │
│        │         │        │         │        │         │       │      │
│        │ 本地调用 │   HTTP │         │  HTTP  │         │  IPC  │      │
│        ▼         │        ▼         │        ▼         │       ▼      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                    opencode Service Layer                    │     │
│  │  (Session, Agent, Tool, Plugin, Config, Git, MCP, LSP)     │     │
│  ├─────────────────────────────────────────────────────────────┤     │
│  │              @opencode-ai/core + @opencode-ai/llm           │     │
│  ├─────────────────────────────────────────────────────────────┤     │
│  │   SQLite    │   File System   │   AI SDK (20+ providers)   │     │
│  └─────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 技术栈与核心依赖

| 类别 | 技术 | 用途 |
|------|------|------|
| 运行时 | Bun 1.3.13 | TypeScript 执行、包管理、测试 |
| 函数式编程 | Effect v4 (0.0.0-beta.65) | 依赖注入、并发控制、错误处理、资源管理 |
| 语言 | TypeScript 5.8 | 静态类型检查 |
| UI (终端) | SolidJS + OpenTUI (@opentui/core, @opentui/solid) | TUI 组件化渲染 |
| UI (Web) | SolidJS + TailwindCSS 4 + Vite | Web 前端 |
| HTTP 服务 | Hono 4.10 | API 服务端框架 |
| 数据库 | Drizzle ORM + SQLite | 会话持久化、元数据存储 |
| AI SDK | Vercel AI SDK (@ai-sdk/*) | LLM 提供商统一接口 |
| 协议 | MCP (Model Context Protocol) | 外部工具集成 |
| 协议 | ACP (Agent Communication Protocol) | Agent 间通信 |
| 桌面 | Electron | 桌面原生应用 |
| 构建 | Turbo 2.8 + Vite 7 | Monorepo 构建 |
| 代码检查 | oxlint | 高性能 lint |
| 遥测 | OpenTelemetry | 可观测性 |

---

## 5. 构建与开发命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动交互式 TUI 开发模式 |
| `bun dev:web` | 启动 Web UI 开发服务器（packages/app） |
| `bun dev:desktop` | 启动 Electron 桌面应用 |
| `bun dev:console` | 启动 Console 应用 |
| `bun dev:storybook` | 启动 Storybook 组件开发 |
| `bun typecheck` | 运行全仓类型检查 |
| `bun lint` | 运行 oxlint 代码检查 |
| `bun run test` | 运行测试（需在包目录内执行） |
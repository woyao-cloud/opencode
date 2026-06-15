# OpenCode 服务层设计文档 — opencode 包

## 1. 包概览

`opencode` 包（`packages/opencode/`）是架构的核心服务层，封装了所有业务逻辑。提供会话管理、Agent 编排、工具系统、插件管理、Git/MCP/LSP 集成等服务。

| 模块 | 目录 | 职责 |
|------|------|------|
| Session | `src/session/` | 会话 CRUD、LLM 流处理编排、状态管理、重试、摘要 |
| Agent | `src/agent/` | Agent 定义、执行循环、子Agent 管理、权限 |
| Tool | `src/tool/` | 工具注册/执行/结果处理、内置工具集 |
| Plugin | `src/plugin/` | 插件加载、TUI 插件 API、插件元数据 |
| Config | `src/config/` | 配置读取/验证/合并 |
| Git | `src/git/` | Git 操作封装 |
| MCP | `src/mcp/` | Model Context Protocol 客户端/服务端 |
| LSP | `src/lsp/` | Language Server Protocol 客户端 |
| PTY | `src/pty/` | 终端模拟（node-pty） |
| Project | `src/project/` | 项目引导、实例管理、工作区 |
| Server | `src/server/` | Hono HTTP 服务、API 路由、认证 |
| Provider | `src/provider/` | AI 提供商服务、模型管理 |
| CLI | `src/cli/` | CLI 入口、命令定义、TUI 渲染 |
| Effect | `src/effect/` | InstanceRef、InstanceState、RuntimeFlags |
| Storage | `src/storage/` | 数据库连接（Bun/Node）、迁移 |
| Permission | `src/permission/` | 权限系统 |
| Skill | `src/skill/` | 技能加载和管理 |
| ACP | `src/acp/` | Agent Communication Protocol |

---

## 2. Session 会话系统

### 2.1 模块职责

| 文件 | 模块 | 职责 |
|------|------|------|
| `session.ts` | `Session.Service` | 会话 CRUD、消息管理、分页查询、Fork |
| `processor.ts` | `SessionProcessor.Service` | LLM 流处理编排、工具调用管理、错误处理 |
| `llm.ts` | `LLM.Service` | AI SDK streamText 调用、系统提示组装、工具解析 |
| `run-state.ts` | `SessionRunState.Service` | 运行状态管理（并发控制、取消） |
| `status.ts` | `SessionStatus.Service` | 会话状态机（idle/busy/retry） |
| `retry.ts` | `SessionRetry` | 重试策略（指数退避、提供商感知） |
| `message-v2.ts` | `MessageV2` | 消息数据模型（User/Assistant/Tool） |
| `todo.ts` | `Todo` | 任务列表管理 |
| `summary.ts` | `SessionSummary` | 会话摘要生成 |
| `search.ts` | `SessionSearch` | 会话搜索 |

### 2.2 SessionProcessor.handle() 完整时序

这是 OpenCode 最关键的调用链——处理用户输入、调用 LLM、执行工具、返回结果：

```
User/CLI           SessionProcessor         LLM.Service           Provider API          ToolSystem          Tool (exec)
  │                      │                      │                     │                     │                  │
  │  handle(input)       │                      │                     │                     │                  │
  │─────────────────────▶│                      │                     │                     │                  │
  │                      │  准备消息上下文        │                     │                     │                  │
  │                      │  组装 system prompt   │                     │                     │                  │
  │                      │  注入工具定义          │                     │                     │                  │
  │                      │                      │                     │                     │                  │
  │                      │  LLM.stream(input)    │                     │                     │                  │
  │                      │─────────────────────▶│                     │                     │                  │
  │                      │                      │  streamText({       │                     │                  │
  │                      │                      │    model,           │                     │                  │
  │                      │                      │    messages,        │                     │                  │
  │                      │                      │    tools,           │                     │                  │
  │                      │                      │    maxSteps: 0      │                     │                  │
  │                      │                      │  })                 │                     │                  │
  │                      │                      │────────────────────▶│                     │                  │
  │                      │                      │                     │  SSE / HTTP POST     │                  │
  │                      │                      │                     │────────────────────▶│                  │
  │                      │                      │                     │                     │                  │
  │                      │                      │◀── textDelta ◀─────│◀── text ◀───────────│                  │
  │◀── text ◀───────────│◀── textDelta ◀───────│                     │                     │                  │
  │                      │                      │                     │                     │                  │
  │                      │                      │◀── toolCall ◀──────│◀── tool_use ◀───────│                  │
  │                      │                      │                     │                     │                  │
  │                      │  onToolCall(toolID,   │                     │                     │                  │
  │                      │    toolName, args)   │                     │                     │                  │
  │                      │                      │                     │                     │                  │
  │                      │  ToolSystem           │                     │                     │                  │
  │                      │  .execute(name,args)  │                     │                     │                  │
  │                      │─────────────────────────────────────────────────────────────────▶│                  │
  │                      │                      │                     │                     │  Shell/Grep/Read │
  │                      │                      │                     │                     │  /Edit/Bash/...  │
  │                      │                      │                     │                     │                  │
  │                      │◀── toolResult ◀──────│─────────────────────│─────────────────────│◀── result ◀─────│
  │                      │                      │                     │                     │                  │
  │                      │  将 tool_result       │                     │                     │                  │
  │                      │  追加到消息历史        │                     │                     │                  │
  │                      │                      │                     │                     │                  │
  │                      │  LLM.stream() 继续    │                     │                     │                  │
  │                      │  (带 tool_result)     │                     │                     │                  │
  │                      │─────────────────────▶│                     │                     │                  │
  │                      │                      │  streamText({       │                     │                  │
  │                      │                      │    messages: +      │                     │                  │
  │                      │                      │      toolResult     │                     │                  │
  │                      │                      │  })                 │                     │                  │
  │                      │                      │────────────────────▶│                     │                  │
  │                      │                      │                     │                     │                  │
  │                      │◀── textDelta ◀───────│◀── text ◀──────────│                     │                  │
  │                      │                      │                     │                     │                  │
  │                      │◀── finish ◀──────────│◀── finish ◀────────│                     │                  │
  │◀── Result ◀─────────│                      │                     │                     │                  │
  │                      │                      │                     │                     │                  │
  │                      │  SessionSummary      │                     │                     │                  │
  │                      │  .summarize() (fork)  │                     │                     │                  │
  │                      │─────────────────────▶│                     │                     │                  │
```

### 2.3 会话状态机

```
                  ┌─────────┐
                  │  idle   │
                  └────┬────┘
                       │ handle()
                       ▼
                  ┌─────────┐
            ┌─────│  busy   │─────┐
            │     └────┬────┘     │
            │          │          │
            ▼          ▼          ▼
       ┌────────┐ ┌────────┐ ┌────────┐
       │ retry  │ │cancel  │ │complete│
       └───┬────┘ │(manual) │ └────┬───┘
           │      └────────┘      │
           ▼                      ▼
        ┌─────────┐          ┌─────────┐
        │  idle   │          │  idle   │
        └─────────┘          └─────────┘
```

---

## 3. Agent 系统

### 3.1 架构

Agent 系统负责 AI Agent 的定义、执行循环、子 Agent 管理和权限控制：

| 文件 | 模块 | 职责 |
|------|------|------|
| `agent.ts` | `Agent` | Agent 元数据、配置、执行入口 |
| `permissions.ts` | 权限检查 | 子 Agent 权限校验 |
| `subagent-*.ts` | 子 Agent | 子 Agent 执行管理 |

### 3.2 Agent 执行循环

```
Agent.Entry          Agent.Runtime          LLM.Service          ToolSystem          SessionProcessor
  │                      │                      │                     │                    │
  │ run(goal)            │                      │                     │                    │
  │─────────────────────▶│                      │                     │                    │
  │                      │  Agent 思考           │                     │                    │
  │                      │  (think → plan)      │                     │                    │
  │                      │─────────────────────▶│                     │                    │
  │                      │                      │  LLM 生成下一步      │                    │
  │                      │                      │  计划 + 工具调用     │                    │
  │                      │◀── next action ◀─────│                     │                    │
  │                      │                      │                     │                    │
  │                      │  ┌─── 循环 ────────────────────────────────│                    │
  │                      │  │  执行工具           │                     │                    │
  │                      │  │──────────────────────────────▶─────────▶│                    │
  │                      │  │◀── result ◀─────────────────────────────│                    │
  │                      │  │  更新上下文          │                     │                    │
  │                      │  │  继续思考            │                     │                    │
  │                      │  │─────────────────────▶│                     │                    │
  │                      │  └─────────────────────│─────────────────────│                    │
  │                      │                      │                     │                    │
  │                      │  goal 完成            │                     │                    │
  │                      │─────────────────────▶│                     │                    │
  │                      │◀── complete ◀────────│                     │                    │
  │◀── Result ◀─────────│                      │                     │                    │
```

---

## 4. Tool 工具系统

### 4.1 内置工具集

| 工具 | 文件 | 说明 |
|------|------|------|
| `read` | `src/tool/read.ts` | 读取文件内容 |
| `edit` | `src/tool/edit.ts` | 编辑文件（精确替换） |
| `grep` | `src/tool/grep.ts` | 正则搜索文件内容 |
| `glob` | `src/tool/glob.ts` | 文件模式匹配 |
| `bash` | `src/tool/bash.ts` | 执行 shell 命令 |
| `lsp` | `src/tool/lsp.ts` | LSP 代码分析 |
| `directory` | `src/tool/directory.ts` | 目录浏览 |
| `agent` | `src/tool/agent.ts` | 子 Agent 委派 |
| `create` | `src/tool/create.ts` | 创建新文件 |

### 4.2 工具执行时序

```
LLM (tool_call)       ToolRegistry          Tool (impl)         Permission        ToolResult
  │                      │                      │                  │                  │
  │ tool_call(name,args) │                      │                  │                  │
  │─────────────────────▶│                      │                  │                  │
  │                      │  ToolRegistry.get()  │                  │                  │
  │                      │  (查找工具实现)       │                  │                  │
  │                      │                      │                  │                  │
  │                      │  Permission.check()  │                  │                  │
  │                      │────────────────────────────────────────▶│                  │
  │                      │                      │                  │                  │
  │                      │                      │ 允许/拒绝         │                  │
  │                      │◀── allowed ◀────────│◀── allowed ◀────│                  │
  │                      │                      │                  │                  │
  │                      │  tool.execute(args)  │                  │                  │
  │                      │────────────────────▶│                  │                  │
  │                      │                      │  执行具体操作      │                  │
  │                      │                      │  (read/grep/edit) │                  │
  │                      │                      │                  │                  │
  │                      │                      │  格式化结果        │                  │
  │                      │                      │──────────────────────────────────▶│
  │                      │◀── ToolResult ◀─────│                  │                  │
  │◀── result ◀─────────│                      │                  │                  │
```

---

## 5. Plugin 插件系统

### 5.1 插件加载生命周期

```
Plugin Manager         Plugin Resolver        File System          Plugin Instance      TUI Plugin API
  │                        │                      │                     │                    │
  │ scan()                 │                      │                     │                    │
  │───────────────────────▶│                      │                     │                    │
  │                        │  扫描 plugin/ 目录    │                     │                    │
  │                        │────────────────────▶│                     │                    │
  │                        │◀── 文件列表 ◀───────│                     │                    │
  │                        │                      │                     │                    │
  │                        │  resolve()            │                     │                    │
  │                        │  (解析为 Entry[])    │                     │                    │
  │◀── entries ◀──────────│                      │                     │                    │
  │                        │                      │                     │                    │
  │  load(entry)           │                      │                     │                    │
  │───────────────────────────────────────────────────────────────────▶│                    │
  │                        │                      │                     │                    │
  │                        │                      │                     │  init(api)         │
  │                        │                      │                     │──────────────────▶│
  │                        │                      │                     │                    │
  │                        │                      │                     │  register slots    │
  │                        │                      │                     │  (home_footer,     │
  │                        │                      │                     │   sidebar, ...)    │
  │                        │                      │                     │                    │
  │◀── loaded ◀───────────│──────────────────────│─────────────────────│◀── ok ◀───────────│
```

---

## 6. 关键目录结构

`packages/opencode/src/` 主要模块：

```
src/
├── index.ts              — 主入口
├── session/              — 会话系统
│   ├── session.ts        — Session CRUD
│   ├── processor.ts      — SessionProcessor 流编排
│   ├── llm.ts            — LLM 调用封装
│   ├── run-state.ts      — 运行状态
│   ├── status.ts         — 会话状态机
│   ├── retry.ts          — 重试策略
│   ├── message-v2.ts     — 消息模型
│   ├── todo.ts           — 任务列表
│   ├── summary.ts        — 摘要生成
│   └── search.ts         — 会话搜索
├── agent/                — Agent 系统
│   ├── agent.ts          — Agent 定义与执行
│   └── permissions.ts    — Agent 权限
├── tool/                 — 工具系统
│   ├── read.ts, edit.ts, grep.ts, glob.ts, bash.ts
│   ├── lsp.ts, directory.ts, create.ts
│   └── registry.ts       — 工具注册表
├── plugin/               — 插件系统
│   ├── meta.ts           — 插件元数据
│   └── internal.ts       — 内部插件
├── config/               — 配置系统
├── mcp/                  — MCP 协议集成
├── lsp/                  — LSP 客户端
├── pty/                  — 终端模拟
├── project/              — 项目管理
├── server/               — HTTP 服务
├── provider/             — 提供商管理
├── cli/                  — CLI 命令
│   ├── cmd/              — 各命令实现
│   └── cmd/tui/          — TUI 渲染
├── effect/               — Effect 工具
├── storage/              — 数据库
├── permission/           — 权限
├── skill/                — 技能
└── acp/                  — Agent 通信协议
```
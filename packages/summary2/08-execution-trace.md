# OpenCode 执行路径追踪文档 — 从启动到代码生成

## 1. 概述

本文档追踪 `opencode run` 命令从进程启动到最终代码文件生成到磁盘的完整执行路径，标注每个步骤调用的具体文件、函数和模块。

---

## 2. 完整调用链总览

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  1. 进程入口    packages/opencode/src/index.ts                                       │
│     ↓                                                                               │
│  2. CLI 分发    packages/opencode/src/cli/cmd/run.ts (RunCommand)                    │
│     ↓                                                                               │
│  3. 运行环境    packages/opencode/src/cli/cmd/run/runtime.ts (runInteractiveLocalMode)│
│     ↓                                                                               │
│  4. Server 启动 packages/opencode/src/server/server.ts (Hono Server)                  │
│     ↓                                                                               │
│  5. 会话创建    packages/opencode/src/session/session.ts (Session.create)             │
│     ↓                                                                               │
│  6. 消息处理    packages/opencode/src/session/processor.ts (SessionProcessor.process) │
│     ↓                                                                               │
│  7. LLM 调用    packages/opencode/src/session/llm.ts (LLM.Service.stream)             │
│     ↓                                                                               │
│  8. AI SDK      packages/core/src/aisdk.ts (+ @ai-sdk/*) → Provider HTTP API          │
│     ↓                                                                               │
│  9. 事件处理    processor.ts handleEvent() → text / tool_call 分发                    │
│     ↓                                                                               │
│  10. 工具执行   packages/opencode/src/tool/edit.ts / create.ts / ...                  │
│     ↓                                                                               │
│  11. 文件写入   原生 fs.writeFile() → 磁盘                                             │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 阶段一：进程启动与 CLI 分发

### 3.1 yargs CLI 入口

| 文件 | 关键代码 |
|------|----------|
| `packages/opencode/src/index.ts` | yargs CLI 配置、命令注册、全局中间件 |

**调用过程：**

```
进程启动 (bun run src/index.ts)
    │
    ├── process.on("unhandledRejection")  ← 全局异常处理 (index.ts:46-50)
    ├── process.on("uncaughtException")   ← 全局异常处理 (index.ts:52-56)
    │
    ├── yargs(args)                       ← 创建 CLI 解析器 (index.ts:70)
    ├── .middleware()                     ← 全局中间件 (index.ts:91-155)
    │   ├── Log.init()                    ← 初始化日志系统
    │   ├── Heap.start()                  ← 启动堆分析
    │   ├── 设置环境变量 AGENT=1, OPENCODE=1, OPENCODE_PID
    │   └── JsonMigration.run()           ← 首次运行自动执行 JSON→SQLite 迁移
    │
    ├── .command(AcpCommand)             ← 注册 ACP 命令
    ├── .command(McpCommand)             ← 注册 MCP 命令
    ├── .command(RunCommand)             ← 注册 run 命令 ★ 关键入口
    ├── .command(GenerateCommand)        ← 注册 generate 命令
    ├── .command(...)                    ← 注册其余 17+ 命令
    │
    └── await cli.parse()                ← 解析参数并执行匹配命令 (index.ts:203)
                                              ↓
                                     命中 "run" 子命令
```

### 3.2 RunCommand 处理

| 文件 | 关键导出 |
|------|----------|
| `packages/opencode/src/cli/cmd/run.ts` | `export const RunCommand: CommandModule` |

**调用过程：**

```
RunCommand.handler(args)                  ← yargs 分发入口 (run.ts)
    │
    ├── 解析参数: message, interactive, attach, session, continue, fork, model, agent, format...
    │
    ├── 模式选择 (run.ts:239-851):
    │   ├── [交互模式本地] args.interactive && !args.attach
    │   │   └── runInteractiveLocalMode({  ← 调用运行环境 (run.ts:814)
    │   │         directory, fetch, resolveAgent,
    │   │         session, share, createSession,
    │   │         agent, model, variant, message
    │   │       })
    │   │
    │   ├── [非交互模式] 默认
    │   │   └── SDK client → HTTP Server → SessionProcessor
    │   │
    │   └── [附加远程] args.attach
    │       └── SDK client → remote HTTP Server
```

---

## 4. 阶段二：运行环境初始化

### 4.1 交互式本地运行模式

| 文件 | 关键导出的函数/类型 |
|------|---------------------|
| `packages/opencode/src/cli/cmd/run/runtime.ts` | `runInteractiveLocalMode()` |

```
runInteractiveLocalMode()                 ← 懒加载 (run.ts:31: runtimeTask)
    │
    ├── Server.Default()                  ← 创建/获取本地 Hono 服务器实例
    │   └── packages/opencode/src/server/server.ts
    │       └── Server 启动:
    │           ├── Session layer 初始化
    │           ├── Project bootstrap
    │           ├── Provider 初始化
    │           ├── Tool registry 初始化
    │           ├── Plugin 加载
    │           └── HTTP route 注册 (POST /v2/sessions, POST /v2/sessions/:id/prompt, ...)
    │
    ├── session.create() / SDK 创建会话
    │   └── HTTP POST → Server → Session.Service
    │
    └── 进入交互循环:
        ├── 读取用户输入 (stdin / TUI)
        ├── SDK session.prompt(message)
        │   └── HTTP POST → Server → SessionProcessor
        ├── 流式接收 events (SSE)
        └── 渲染到 TUI / 输出
```

---

## 5. 阶段三：关键时序图 — 完整执行路径

### 5.1 启动 → 用户输入 → 代码生成 完整时序

```
Process Entry          RunCommand           Server(Hono)          SessionProcessor          LLM.Service           AI SDK / Provider          Tool System           File System
(index.ts)            (cli/cmd/run.ts)     (server/server.ts)    (session/processor.ts)   (session/llm.ts)       (core/aisdk.ts)          (tool/*.ts)
    │                      │                      │                      │                      │                      │                      │                    │
    │ bun run src/index.ts│                      │                      │                      │                      │                      │                    │
    │────────────────────▶│                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │  yargs.parse()       │                      │                      │                      │                      │                      │                    │
    │────────────────────▶│                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │  ─── 中间件 ───       │                      │                      │                      │                      │                    │
    │                      │  Log.init()          │                      │                      │                      │                      │                    │
    │                      │  Heap.start()        │                      │                      │                      │                      │                    │
    │                      │  JsonMigration.run() │                      │                      │                      │                      │                    │
    │                      │  (首次: JSON→SQLite) │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │  RunCommand          │                      │                      │                      │                      │                    │
    │                      │  .handler(args)      │                      │                      │                      │                      │                    │
    │                      │──(run.ts:814)───────▶│                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │  === Server 初始化 ===│                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │  Server.Default()    │                      │                      │                      │                      │                    │
    │                      │────────────────────▶│                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │  Layer.build()       │                      │                      │                      │                    │
    │                      │                      │  (Effect 层初始化)    │                      │                      │                      │                    │
    │                      │                      │────────────────────▶│                      │                      │                      │                    │
    │                      │                      │                      │  Session.layer        │                      │                      │                    │
    │                      │                      │                      │  (SQLite 连接)        │                      │                      │                    │
    │                      │                      │                      │────────────────────▶│                      │                      │                    │
    │                      │                      │                      │                      │  LLM.layer            │                      │                    │
    │                      │                      │                      │                      │  (Provider 初始化)    │                      │                    │
    │                      │                      │                      │                      │────────────────────▶│                      │                    │
    │                      │                      │                      │                      │                      │  init() → 20+       │                    │
    │                      │                      │                      │                      │                      │  提供商注册           │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  Tool.layer           │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  (注册内置工具集)      │                      │                      │                    │
    │                      │                      │                      │  read / edit / grep   │                      │                      │                    │
    │                      │                      │                      │  glob / bash / lsp    │                      │                      │                    │
    │                      │                      │                      │  create / directory   │                      │                      │                    │
    │                      │                      │                      │  agent / lsp          │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  Plugin.layer         │                      │                      │                    │
    │                      │                      │                      │  (扫描+加载插件)      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  Bootst.ap             │                      │                      │                    │
    │                      │                      │                      │  (服务启动完成)        │                      │                      │                    │
    │                      │                      │◀── ready ◀──────────│                      │                      │                      │                    │
    │                      │◀── ready ◀───────────│                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │  === 用户输入处理 === │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │  用户: "创建 React   │                      │                      │                      │                      │                      │                    │
    │  组件 Button"        │                      │                      │                      │                      │                      │                    │
    │────────────────────▶│                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │  SDK session          │                      │                      │                      │                      │                    │
    │                      │  .create({title})     │                      │                      │                      │                      │                    │
    │                      │────────────────────▶│                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │  POST /v2/sessions   │                      │                      │                      │                    │
    │                      │                      │  (server/api/        │                      │                      │                      │                    │
    │                      │                      │   session.ts)       │                      │                      │                      │                    │
    │                      │                      │────────────────────▶│                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  Session.create()    │                      │                      │                    │
    │                      │                      │                      │  (session/session.ts)│                      │                      │                    │
    │                      │                      │                      │────────────────────▶│                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  DB: INSERT INTO     │                      │                      │                    │
    │                      │                      │                      │  session (...values) │                      │                      │                    │
    │                      │                      │                      │────────────────────────────────────────────────────────────────────▶│                    │
    │                      │                      │                      │                      │                      │                      │    SQLite          │
    │                      │                      │                      │◀── sessionID ◀──────│──────────────────────│──────────────────────│◀── ok ◀───────────│
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │◀── 201 + session ◀──│                      │                      │                      │                    │
    │                      │◀── sessionID ◀───────│                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │  === 核心处理循环 === │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │  SDK session          │                      │                      │                      │                      │                    │
    │                      │  .prompt({sessionID,  │                      │                      │                      │                      │                    │
    │                      │   message, model})    │                      │                      │                      │                      │                    │
    │                      │────────────────────▶│                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │  POST /v2/sessions/  │                      │                      │                      │                    │
    │                      │                      │  :id/prompt          │                      │                      │                      │                    │
    │                      │                      │────────────────────▶│                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  server/handler.ts   │                      │                      │                    │
    │                      │                      │                      │  → 解析请求           │                      │                      │                    │
    │                      │                      │                      │  → 创建 User 消息     │                      │                      │                    │
    │                      │                      │                      │  → 创建 Assistant     │                      │                      │                    │
    │                      │                      │                      │  → 设置会话状态 busy  │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  SessionProcessor    │                      │                      │                    │
    │                      │                      │                      │  .create({           │                      │                      │                    │
    │                      │                      │                      │    assistantMessage, │                      │                      │                    │
    │                      │                      │                      │    sessionID, model  │                      │                      │                    │
    │                      │                      │                      │  })                  │                      │                      │                    │
    │                      │                      │                      │       ↓              │                      │                      │                    │
    │                      │                      │                      │  .process(input)     │                      │                      │                    │
    │                      │                      │                      │────────────────────▶│                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │  ─── LLM 调用 ─────  │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │  LLM.Service        │                      │                    │
    │                      │                      │                      │                      │  .stream(input)     │                      │                    │
    │                      │                      │                      │                      │  (session/llm.ts    │                      │                    │
    │                      │                      │                      │                      │   :730)             │                      │                    │
    │                      │                      │                      │                      │──── Effect.gen ────▶│                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │  ↓ 内部调用 (llm.ts │                      │                    │
    │                      │                      │                      │                      │    :76-325):         │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │  Effect.all([       │                      │                    │
    │                      │                      │                      │                      │    provider.        │                      │                    │
    │                      │                      │                      │                      │      getLanguage(), │                      │                    │
    │                      │                      │                      │                      │    config.get(),    │                      │                    │
    │                      │                      │                      │                      │    provider.        │                      │                    │
    │                      │                      │                      │                      │      getProvider(), │                      │                    │
    │                      │                      │                      │                      │    auth.get()       │                      │                    │
    │                      │                      │                      │                      │  ])                 │                      │                    │
    │                      │                      │                      │                      │────────────────────▶│                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │  resolveTools()     │                      │                    │
    │                      │                      │                      │                      │  (llm.ts:195)       │                      │                    │
    │                      │                      │                      │                      │  → 收集所有可用工具   │                      │                    │
    │                      │                      │                      │                      │────────────────────▶│                      │                    │
    │                      │                      │                      │                      │                      │  ToolRegistry       │                    │
    │                      │                      │                      │                      │                      │  .list()            │                    │
    │                      │                      │                      │                      │                      │────────────────────▶│                    │
    │                      │                      │                      │                      │                      │◀── tools[] ◀───────│                    │
    │                      │                      │                      │                      │◀── tools ◀─────────│                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │  ↓ (llm.ts:325)     │                      │                    │
    │                      │                      │                      │                      │  streamText({       │                      │                    │
    │                      │                      │                      │                      │    model: language, │                      │                    │
    │                      │                      │                      │                      │    messages,        │                      │                    │
    │                      │                      │                      │                      │    tools:           │                      │                    │
    │                      │                      │                      │                      │      sortedTools,   │                      │                    │
    │                      │                      │                      │                      │    temperature,     │                      │                    │
    │                      │                      │                      │                      │    maxTokens,       │                      │                    │
    │                      │                      │                      │                      │    maxSteps: 0,     │                      │                    │
    │                      │                      │                      │                      │    onError,         │                      │                    │
    │                      │                      │                      │                      │    experimental_    │                      │                    │
    │                      │                      │                      │                      │      repairToolCall,│                      │                    │
    │                      │                      │                      │                      │    headers,         │                      │                    │
    │                      │                      │                      │                      │    ...options       │                      │                    │
    │                      │                      │                      │                      │  })                 │                      │                    │
    │                      │                      │                      │                      │────────────────────▶│                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │  @ai-sdk/provider   │                    │
    │                      │                      │                      │                      │                      │  .doStream()        │                    │
    │                      │                      │                      │                      │                      │────────────────────▶│                    │
    │                      │                      │                      │                      │                      │                      │  HTTP POST          │
    │                      │                      │                      │                      │                      │                      │  → Provider API     │
    │                      │                      │                      │                      │                      │                      │  (Anthropic/OpenAI  │
    │                      │                      │                      │                      │                      │                      │   /Google/...)       │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │◀── SSE stream ◀────│◀── response ◀─────│
    │                      │                      │                      │                      │                      │                      │                    │
    │  ─── 事件处理 ────  │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │◀── Stream<Event> ◀─│                      │                    │
    │                      │                      │                      │                      │  (fullStream)       │                      │                    │
    │                      │                      │                      │                      │  [                 │                      │                    │
    │                      │                      │                      │                      │    start-step,      │                      │                    │
    │                      │                      │                      │                      │    reasoning-start, │                      │                    │
    │                      │                      │                      │                      │    reasoning-delta, │                      │                    │
    │                      │                      │                      │                      │    text-start,      │                      │                    │
    │                      │                      │                      │                      │    text-delta,      │                      │                    │
    │                      │                      │                      │                      │    text-end,        │                      │                    │
    │                      │                      │                      │                      │    tool-input-start,│                      │                    │
    │                      │                      │                      │                      │    tool-call,       │                      │                    │
    │                      │                      │                      │                      │    tool-result,     │                      │                    │
    │                      │                      │                      │                      │    finish-step,     │                      │                    │
    │                      │                      │                      │                      │    finish,          │                      │                    │
    │                      │                      │                      │                      │    error            │                      │                    │
    │                      │                      │                      │                      │  ]                  │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  Stream.tap(         │                      │                      │                    │
    │                      │                      │                      │    handleEvent)      │                      │                      │                    │
    │                      │                      │                      │  (processor.ts:732)  │                      │                      │                    │
    │                      │                      │                      │────────────────────▶│                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  ┌─ text-delta 事件   │                      │                      │                    │
    │                      │                      │                      │  │  (processor.ts:578)│                      │                      │                    │
    │                      │                      │                      │  │  ctx.currentText   │                      │                      │                    │
    │                      │                      │                      │  │  += value.text     │                      │                      │                    │
    │                      │                      │                      │  │  session.          │                      │                      │                    │
    │                      │                      │                      │  │    updatePartDelta()│                      │                      │                    │
    │                      │                      │                      │  │                   │                      │                      │                    │
    │◀── SSE: text ◀─────│◀── SSE ◀─────────────│◀── SSE ◀────────────│  │                   │                      │                      │                    │
    │  (流式显示文本)     │                      │                      │  │                   │                      │                      │                    │
    │                      │                      │                      │  └─────────────────│──────────────────────│──────────────────────│                    │
    │                      │                      │                      │  ┌─ tool-call 事件  │                      │                      │                    │
    │                      │                      │                      │  │  (processor.ts:321│                      │                      │                    │
    │                      │                      │                      │  │   :340-378)       │                      │                      │                    │
    │                      │                      │                      │  │  更新 tool part    │                      │                      │                    │
    │                      │                      │                      │  │  状态为 running   │                      │                      │                    │
    │                      │                      │                      │  │                 │                      │                      │                    │
    │                      │                      │                      │  │  (注: 工具实际     │                      │                      │                    │
    │                      │                      │                      │  │  由 AI SDK 内部     │                      │                      │                    │
    │                      │                      │                      │  │  执行, 非 processor)│                      │                      │                    │
    │                      │                      │                      │  │                 │                      │                      │                    │
    │                      │                      │                      │  └────────────────│──────────────────────│──────────────────────│                    │
    │                      │                      │                      │  ┌─ finish-step 事件 │                      │                      │                    │
    │                      │                      │                      │  │  (processor.ts:493)│                      │                      │                    │
    │                      │                      │                      │  │  更新 usage tokens │                      │                      │                    │
    │                      │                      │                      │  │  snapshot.patch()  │                      │                      │                    │
    │                      │                      │                      │  │  SessionSummary    │                      │                      │                    │
    │                      │                      │                      │  │    .summarize()    │                      │                      │                    │
    │                      │                      │                      │  │    (fork, 异步)    │                      │                      │                    │
    │                      │                      │                      │  └────────────────│──────────────────────│──────────────────────│                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  ─── AI SDK 内部工具执行 ─── (maxSteps>0)                         │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │     (AI SDK 在        │                      │                    │
    │                      │                      │                      │                      │     maxSteps>0 时     │                      │                    │
    │                      │                      │                      │                      │     自动执行工具)     │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │  ┌── tool.execute()──│────────────────────▶│                    │
    │                      │                      │                      │                      │  │                   │                      │                    │
    │                      │                      │                      │                      │  │  tool/edit.ts     │                      │                    │
    │                      │                      │                      │                      │  │  (编辑文件)        │                      │                    │
    │                      │                      │                      │                      │  │                   │                      │                    │
    │                      │                      │                      │                      │  │  tool/create.ts   │                      │                    │
    │                      │                      │                      │                      │  │  (创建文件) ★      │                      │                    │
    │                      │                      │                      │                      │  │                   │                      │          ↓         │
    │                      │                      │                      │                      │  │  writeFile()      │                      │          ↓         │
    │                      │                      │                      │                      │  │──────────────────────────────────────────────────────────▶│                    │
    │                      │                      │                      │                      │  │                   │                      │          │         │
    │                      │                      │                      │                      │  │  return {         │                      │          │  磁盘   │
    │                      │                      │                      │                      │  │    output, title,  │                      │          │  文件   │
    │                      │                      │                      │                      │  │    metadata        │                      │          │         │
    │                      │                      │                      │                      │  │  }                │                      │          │         │
    │                      │                      │                      │                      │  └──────────────────│──────────────────────│◀── ok ◀─│◀── ok ─│
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │                      │  tool-result 事件    │                      │                    │
    │                      │                      │                      │  ← 结果流回 processor │                      │                      │                    │
    │                      │                      │                      │  (processor.ts:382)  │                      │                      │                    │
    │                      │                      │                      │  completeToolCall()  │                      │                      │                    │
    │                      │                      │                      │  → 更新 part 状态     │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  Stream.takeUntil()  │                      │                      │                    │
    │                      │                      │                      │  Stream.runDrain()   │                      │                      │                    │
    │                      │                      │                      │  (processor.ts:734)  │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  ─── 重试策略 ───     │                      │                      │                    │
    │                      │                      │                      │  Effect.retry(       │                      │                      │                    │
    │                      │                      │                      │    SessionRetry       │                      │                      │                    │
    │                      │                      │                      │    .policy(...))     │                      │                      │                    │
    │                      │                      │                      │  (processor.ts:750)  │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  ─── 清理 ───         │                      │                      │                    │
    │                      │                      │                      │  Effect.ensuring(    │                      │                      │                    │
    │                      │                      │                      │    cleanup())         │                      │                      │                    │
    │                      │                      │                      │  (processor.ts:782)  │                      │                      │                    │
    │                      │                      │                      │  → snapshot.patch()  │                      │                      │                    │
    │                      │                      │                      │  → 关闭未完成 tool    │                      │                      │                    │
    │                      │                      │                      │  → 更新消息完成时间   │                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │                      │  return Result       │                      │                      │                    │
    │                      │                      │                      │  ("compact" /        │                      │                      │                    │
    │                      │                      │                      │   "stop" / "continue")│                      │                      │                    │
    │                      │                      │                      │                      │                      │                      │                    │
    │                      │                      │◀── complete + SSE ◀─│                      │                      │                      │                    │
    │                      │◀── done ◀────────────│                      │                      │                      │                      │                    │
    │◀── result ◀────────│                      │                      │                      │                      │                      │                    │
```

---

## 6. 按模块文件调用清单

### 6.1 按调用顺序排列的关键文件

| 步骤 | 文件路径 | 关键函数/导出 | 功能 |
|------|----------|--------------|------|
| 1 | `packages/opencode/src/index.ts` | yargs, `cli.parse()`, `.command(RunCommand)` | CLI 入口，参数解析，命令分发 |
| 2 | `packages/opencode/src/cli/cmd/run.ts` | `RunCommand.handler()`, `runInteractiveLocalMode()` | run 命令处理，模式选择 |
| 3 | `packages/opencode/src/cli/cmd/run/runtime.ts` | `runInteractiveLocalMode()` | 交互式运行环境 |
| 4 | `packages/opencode/src/server/server.ts` | `Server.Default()` | Hono HTTP 服务器 |
| 5 | `packages/opencode/src/server/handler.ts` | POST `/v2/sessions/:id/prompt` handler | API 请求处理器 |
| 6 | `packages/opencode/src/session/session.ts` | `Session.create()`, `Session.get()`, `Session.Service` | 会话 CRUD |
| 7 | `packages/opencode/src/session/processor.ts` | `SessionProcessor.create()`, `.process()`, `handleEvent()` | LLM 流编排 |
| 8 | `packages/opencode/src/session/llm.ts` | `LLM.Service`, `.stream()`, `resolveTools()`, `streamText()` | AI SDK 调用 |
| 9 | `packages/opencode/src/provider/provider.ts` | `Provider.Service`, `.getLanguage()`, `.getProvider()` | 提供商管理 |
| 10 | `packages/core/src/aisdk.ts` | `streamText()` wrapper | AI SDK 包装层 |
| 11 | `@ai-sdk/anthropic` (或其它) | `createAnthropic()`, `doStream()` | 提供商 SDK |
| 12 | `packages/opencode/src/tool/registry.ts` | `ToolRegistry.list()` | 工具注册表 |
| 13 | `packages/opencode/src/tool/create.ts` | `tool.execute()` — `writeFile()` | 创建文件 |
| 14 | `packages/opencode/src/tool/edit.ts` | `tool.execute()` — `replaceContent()` | 编辑文件 |
| 15 | `packages/opencode/src/session/status.ts` | `SessionStatus.Service` | 会话状态管理 |
| 16 | `packages/opencode/src/session/retry.ts` | `SessionRetry.policy()` | 重试策略 |
| 17 | `packages/opencode/src/session/summary.ts` | `SessionSummary.summarize()` | 摘要生成 |
| 18 | `packages/opencode/src/session/message-v2.ts` | `MessageV2` 类型定义 | 消息数据模型 |
| 19 | `packages/opencode/src/snapshot/index.ts` | `Snapshot.Service`, `.track()`, `.patch()` | 文件快照 |
| 20 | `packages/opencode/src/config/config.ts` | `Config.Service`, `.get()` | 配置读取 |
| 21 | `packages/opencode/src/auth/index.ts` | `Auth.Service` | 认证管理 |
| 22 | `packages/opencode/src/permission/index.ts` | `Permission.Service`, `.ask()` | 权限管理 |
| 23 | `packages/opencode/src/plugin/index.ts` | `Plugin.Service`, `.trigger()` | 插件系统 |
| 24 | `packages/opencode/src/project/bootstrap.ts` | `InstanceBootstrap.Service` | 项目引导 |
| 25 | `packages/opencode/src/effect/instance-state.ts` | `InstanceState.make()`, `.get()` | 实例状态管理 |
| 26 | `packages/opencode/src/storage/db.bun.ts` | `Database.Client()` | SQLite 数据库连接 |
| 27 | `packages/core/src/event.ts` | `EventV2.Service`, `.publish()`, `.subscribe()` | 事件总线 |

### 6.2 初始化阶段加载的模块

`packages/opencode/src/session/processor.ts` 的 `defaultLayer` 定义了完整的服务依赖链：

```typescript
// processor.ts:805-821
Session.defaultLayer         → session/session.ts
Snapshot.defaultLayer        → snapshot/index.ts
Agent.defaultLayer           → agent/agent.ts
LLM.defaultLayer             → session/llm.ts
Permission.defaultLayer      → permission/index.ts
Plugin.defaultLayer          → plugin/index.ts
SessionSummary.defaultLayer  → session/summary.ts
SessionStatus.defaultLayer   → session/status.ts
Image.defaultLayer           → image/image.ts
Bus.layer                    → bus/index.ts
Config.defaultLayer          → config/config.ts
RuntimeFlags.defaultLayer    → effect/runtime-flags.ts
EventV2Bridge.defaultLayer   → event-v2-bridge.ts
```

---

## 7. LLM.stream() 内部调用细节

`packages/opencode/src/session/llm.ts` 中的 `Effect.fn("LLM.run")` (llm.ts:76-325):

```
LLM.Service.stream(input)
    │
    ├── Effect.all([                          ← 并行获取 4 个依赖 (llm.ts:90-98)
    │     provider.getLanguage(input.model)   → 获取 AI SDK LanguageModel 实例
    │     config.get()                        → 读取用户配置
    │     provider.getProvider(input.model)   → 获取提供商元数据
    │     auth.get(input.model.providerID)    → 获取认证凭证
    │   ])
    │
    ├── 组装 system prompt (llm.ts:103-159)
    │     SystemPrompt.provider(input.model)  → 提供商默认系统提示
    │     + input.system (自定义提示)
    │     + input.user.system (用户消息中嵌入的提示)
    │
    ├── plugin.trigger("chat.params", ...)    ← 插件钩子: 修改参数 (llm.ts:161)
    ├── plugin.trigger("chat.headers", ...)   ← 插件钩子: 修改请求头 (llm.ts:181)
    │
    ├── resolveTools(input)                   ← 收集工具定义 (llm.ts:195)
    │     → ToolRegistry → tool/*.ts          ← 从工具注册表获取所有工具
    │     → 按字母排序 → sortedTools
    │
    └── streamText({                          ← AI SDK 核心调用 (llm.ts:325)
          model: language,                    ← 提供商 LanguageModel
          messages: system + user + history,  ← 完整消息历史
          tools: sortedTools,                 ← 工具定义集合
          maxSteps: 0,                        ← 0 = 外部控制工具执行
          temperature / topP / topK / ...
          headers,                            ← 插件提供的请求头
          onError,                            ← 错误回调
          experimental_repairToolCall,        ← ToolCall 修复
          toolsMaxOutputTokens: ...
        })
```

---

## 8. Tool 工具执行细节

当 AI SDK 检测到 LLM 请求使用工具时（maxStep=0 时，工具在下一轮由 processor 控制），等到下一次 stream 循环中 LLM 返回 tool_call，AI SDK 在内部执行 `tool.execute(args)`：

### 8.1 关键工具实现文件

| 工具名 | 文件 | execute() 行为 |
|--------|------|---------------|
| `read` | `packages/opencode/src/tool/read.ts` | 读取文件内容 → 返回文本 |
| `edit` | `packages/opencode/src/tool/edit.ts` | 精确替换文件内容 → 写磁盘 |
| `create` | `packages/opencode/src/tool/create.ts` | 创建新文件 → 写磁盘 |
| `grep` | `packages/opencode/src/tool/grep.ts` | 正则搜索 → 返回匹配行 |
| `glob` | `packages/opencode/src/tool/glob.ts` | 文件模式匹配 → 返回文件列表 |
| `bash` | `packages/opencode/src/tool/bash.ts` | 执行 shell 命令 → 返回输出 |
| `lsp` | `packages/opencode/src/tool/lsp.ts` | LSP 代码分析 → 返回诊断 |
| `agent` | `packages/opencode/src/tool/agent.ts` | 委派子 Agent → 返回结果 |

### 8.2 代码生成工具的内部调用 (tool/create.ts)

```
tool/create.ts: execute({ path, content })
    │
    ├── 校验路径安全 (防止路径穿越)
    ├── 确保父目录存在
    ├── fs.writeFile(path, content)
    │   └── 原生文件系统写入 → 磁盘
    │
    └── return {
          output: `Created file ${path}`,
          title: `Create ${filename}`,
          metadata: { path, action: "create" }
        }
```

---

## 9. 数据库操作

| 操作 | 文件 | SQL |
|------|------|-----|
| 创建会话 | `packages/opencode/src/session/session.ts` | `INSERT INTO session (...) VALUES (...)` |
| 添加消息 | `session.ts` | `INSERT INTO message (id, session_id, ...) VALUES (...)` |
| 添加 part | `session.ts` | `INSERT INTO part (id, message_id, session_id, ...)` |
| 更新 part (delta) | `session.ts` | `UPDATE part SET data = ... WHERE id = ...` |
| 更新会话 token | `session.ts` | `UPDATE session SET tokens_input=..., tokens_output=...` |

---

## 10. 事件流总结

Processor 处理的 LLM 事件类型（来自 `ai` SDK 的 `fullStream`）：

| 事件类型 | 处理位置 (processor.ts) | 行为 |
|----------|------------------------|------|
| `start` | line 216-218 | 设置会话状态 → `busy` |
| `reasoning-start` | line 220-239 | 创建 reasoning part |
| `reasoning-delta` | line 242-253 | 追加 reasoning 文本 |
| `reasoning-end` | line 255-272 | 完成 reasoning part |
| `text-start` | line 556-576 | 创建 text part |
| `text-delta` | line 578-589 | 追加文本 → 流式推送客户端 |
| `text-end` | line 591-622 | 完成 text part, 插件钩子 |
| `tool-input-start` | line 274-303 | 创建 tool part (pending) |
| `tool-call` | line 321-379 | 更新 tool part (running), doom loop 检测 |
| `tool-result` | line 382-439 | 完成 tool part, 处理附件 |
| `tool-error` | line 442-461 | 标记 tool part (error) |
| `start-step` | line 466-491 | 创建 step-start part, 快照 |
| `finish-step` | line 493-554 | cost/token 统计, 差异快照, 异步摘要 |
| `finish` | line 623-624 | 流结束 |
| `error` | line 463-464 | 抛出异常 |
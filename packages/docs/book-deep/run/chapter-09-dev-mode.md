# 第 9 章 · 开发模式：bun run dev 启动全链路

## 9.1 场景概述

`bun run dev` 是 opencode 开发过程中最常用的命令。它启动完整的 opencode 终端界面（TUI），让开发者可以在本地实时测试代码修改。与生产模式（`opencode run`）不同，开发模式有特殊的启动路径：它直接从 TypeScript 源码运行，使用 Bun 的 `--conditions=browser` 标志，并采用主线程+Worker 线程的双线程架构。

为什么需要理解这个流程？因为开发模式涉及 CLI 入口、yargs 中间件、数据库迁移、Worker 线程启动、HTTP 服务端创建、TUI 渲染——几乎触及 opencode 的所有核心子系统。理解这个流程等于理解 opencode 的"启动全景图"。

## 9.2 命令定义

```text
根 package.json:
  "dev": "bun run --cwd packages/opencode --conditions=browser src/index.ts"

packages/opencode/package.json:
  "dev": "bun run --conditions=browser ./src/index.ts"
```

`--conditions=browser` 是 Bun 的模块解析标志。它告诉 Bun 在解析 `package.json` 的 `exports` 字段时，优先使用 `"browser"` 条件。这意味着某些包会使用 Web API 实现（如 `fetch`、`WebSocket`）而非 Node.js API 实现。opencode 的 TUI 基于 React/Ink，需要浏览器-like 的运行环境。

## 9.3 触发流程

```text
bun run dev
    │
    ▼
┌─ src/index.ts (CLI 入口) ──────────────────────────────────┐
│                                                             │
│  ① 进程初始化                                                │
│     ensureProcessMetadata("main")                           │
│     设置进程角色 + 运行 ID                                    │
│                                                             │
│  ② 全局错误处理注册                                          │
│     process.on("unhandledRejection", ...)                   │
│     process.on("uncaughtException", ...)                    │
│                                                             │
│  ③ yargs CLI 构建                                           │
│     .scriptName("opencode")                                 │
│     .option("print-logs")                                   │
│     .option("log-level")                                    │
│     .option("pure")                                         │
│                                                             │
│  ④ 中间件 (middleware) 执行                                 │
│     ┌─ Log.init()  日志系统初始化                             │
│     │  开发模式 → level="DEBUG"                              │
│     │  日志写入 dev.log (可复用)                              │
│     ├─ Heap.start()  内存监控启动                            │
│     │  每分钟检查 RSS > 2GB → 自动 Heap Snapshot             │
│     ├─ 设置环境变量                                          │
│     │  AGENT=1, OPENCODE=1, OPENCODE_PID                    │
│     └─ 数据库迁移 (首次运行)                                 │
│        JsonMigration.run()                                  │
│        从 JSON 文件迁移到 SQLite                             │
│        显示进度条 (TTY 模式)                                 │
│                                                             │
│  ⑤ 注册所有命令                                              │
│     AcpCommand, McpCommand, TuiThreadCommand,               │
│     AttachCommand, RunCommand, ServeCommand,                │
│     WebCommand, AgentCommand, GithubCommand...              │
│     (共 20+ 命令)                                            │
│                                                             │
│  ⑥ yargs 解析命令行参数                                      │
│     cli.parse()                                             │
│     ┌─ 无参数 → 匹配 "$0" → TuiThreadCommand                │
│     └─ 有参数 → 匹配对应命令                                 │
└────────────────────────────────────────────────────────────┘
    │
    │ (默认: 无参数 → TuiThreadCommand)
    ▼
┌─ TuiThreadCommand (cli/cmd/tui/thread.ts) ─────────────────┐
│                                                             │
│  ① 确定工作目录                                              │
│     resolveThreadDirectory(project)                         │
│     → 环境变量 PWD 或 process.cwd()                          │
│                                                             │
│  ② 确定 Worker 入口文件                                      │
│     target()                                                │
│     → 优先: OPENCODE_WORKER_PATH (编译产物)                  │
│     → 其次: dist/worker.js                                  │
│     → 最后: ./worker.ts (开发模式)                           │
│                                                             │
│  ③ 创建 RPC 客户端                                           │
│     Rpc.client<typeof rpc>({                                │
│       spawn: Bun.spawn([bun, workerPath, ...])              │
│     })                                                      │
│     → 主线程与 Worker 通过 RPC 通信                          │
│                                                             │
│  ④ 创建 Worker Fetch 代理                                    │
│     createWorkerFetch(client)                               │
│     → 主线程的 fetch 请求通过 RPC 转发给 Worker              │
│     → Worker 执行实际的 HTTP 请求                             │
│                                                             │
│  ⑤ 创建事件源代理                                            │
│     createEventSource(client)                               │
│     → Worker 的全局事件通过 RPC 推送给主线程                  │
│                                                             │
│  ⑥ 启动 TUI 渲染                                             │
│     render(<App ... />)                                     │
│     → React/Ink 终端 UI 组件树                               │
│     → 通过 RPC 调用 Worker 的 API                           │
│                                                             │
│  ⑦ 处理 stdin 输入                                           │
│     input(value)                                            │
│     → 管道输入 (piped) + 命令行参数                           │
└────────────────────────────────────────────────────────────┘
    │
    │ (Worker 线程并行启动)
    ▼
┌─ Worker 线程 (cli/cmd/tui/worker.ts) ───────────────────────┐
│                                                             │
│  ① 进程初始化                                                │
│     ensureProcessMetadata("worker")                         │
│     Log.init() + Heap.start()                               │
│                                                             │
│  ② 启动 HTTP 服务端                                          │
│     Server.listen(opts)                                     │
│     → 默认端口 4096                                          │
│     → 提供 Session/Config/File/Permission 等 API            │
│                                                             │
│  ③ 注册 RPC 方法                                             │
│     Rpc.server({                                            │
│       fetch: 执行 HTTP 请求                                  │
│       config: 读取配置                                       │
│       session: 会话操作                                      │
│       ...                                                    │
│     })                                                      │
│     → 主线程通过 RPC 调用这些方法                             │
│                                                             │
│  ④ 发布全局事件                                              │
│     GlobalBus → 主线程通过 EventSource 订阅                  │
│                                                             │
│  ⑤ 处理进程退出                                              │
│     disposeAllInstancesAndEmitGlobalDisposed()              │
│     → 清理所有项目实例                                       │
└────────────────────────────────────────────────────────────┘
```

## 9.4 关键触发点详解

### 触发点 1：yargs 中间件 — 启动时的初始化序列

**文件**：`src/index.ts:91-155`

```typescript
.middleware(async (opts) => {
  // ① 纯模式：禁用外部插件
  if (opts.pure) {
    process.env.OPENCODE_PURE = "1"
  }

  // ② 日志初始化
  await Log.init({
    print: process.argv.includes("--print-logs"),
    dev: Installation.isLocal(),  // 开发模式 → true
    level: (() => {
      if (opts.logLevel) return opts.logLevel as Log.Level
      if (Installation.isLocal()) return "DEBUG"  // 开发模式 → DEBUG
      return "INFO"
    })(),
  })

  // ③ 内存监控
  Heap.start()

  // ④ 环境变量
  process.env.AGENT = "1"
  process.env.OPENCODE = "1"
  process.env.OPENCODE_PID = String(process.pid)

  // ⑤ 数据库迁移（首次运行）
  const marker = path.join(Global.Path.data, "opencode.db")
  if (!(await Filesystem.exists(marker))) {
    await JsonMigration.run(drizzle({ client: Database.Client().$client }), {
      progress: (event) => { /* 进度条渲染 */ }
    })
  }
})
```

**自然语言解释**：yargs 的 `middleware` 在所有命令执行之前运行。这是 opencode 的"启动初始化序列"：日志系统根据 `Installation.isLocal()` 判断是否为开发模式（开发模式 → DEBUG 级别日志 + dev.log 文件），Heap 监控启动（每分钟检查内存），环境变量设置（标识进程为 opencode Agent），以及首次运行时的数据库迁移（从 JSON 文件迁移到 SQLite，带进度条）。这个中间件确保无论用户执行哪个命令，基础环境都已就绪。

### 触发点 2：Installation.isLocal() — 开发模式检测

**文件**：`installation/index.ts`（通过 `@opencode-ai/core/installation/version` 引用）

**自然语言解释**：`Installation.isLocal()` 检查 opencode 是否从本地源码运行（而非 npm 全局安装）。判断依据是检查 `package.json` 中是否包含特定字段。开发模式下：日志级别默认为 DEBUG、日志写入 `dev.log`（可复用，不按时间戳命名）、自动更新检查被跳过。这个检测影响了整个启动流程的行为。

### 触发点 3：TuiThreadCommand — 默认命令（$0）

**文件**：`cli/cmd/tui/thread.ts:79`

```typescript
export const TuiThreadCommand = cmd({
  command: "$0 [project]",  // "$0" = 无参数时的默认命令
  describe: "start opencode tui",
  // ...
})
```

**自然语言解释**：`$0` 是 yargs 的"默认命令"——当用户只输入 `opencode`（或 `bun run dev`）而不带任何子命令时，yargs 匹配 `$0` 并执行 `TuiThreadCommand`。这就是为什么 `bun run dev` 直接启动 TUI 终端界面。`[project]` 是可选的位置参数，允许指定启动的工作目录。

### 触发点 4：双线程架构 — RPC 通信

**文件**：`cli/cmd/tui/thread.ts:59-64, 31-57`

```text
主线程 (thread.ts)              Worker 线程 (worker.ts)
    │                                │
    │─Bun.spawn(workerPath)─────────→│ 启动 Worker
    │                                │
    │─Rpc.client({ spawn })─────────→│ Rpc.server({ methods })
    │  创建 RPC 客户端                 │  注册可调用的方法
    │                                │
    │─client.call("fetch", {...})───→│ 执行 HTTP 请求
    │←── result ─────────────────────│
    │                                │
    │─client.on("global.event")─────→│ 订阅全局事件
    │←── event ──────────────────────│ 推送事件
```

**自然语言解释**：opencode 的 TUI 采用双线程架构。主线程负责 UI 渲染（React/Ink），Worker 线程负责 HTTP 服务端和业务逻辑。两者通过 RPC（Remote Procedure Call）通信——主线程通过 `Rpc.client` 调用 Worker 的方法，Worker 通过 `Rpc.server` 注册可调用的方法。`createWorkerFetch` 将主线程的 `fetch` 请求代理到 Worker——这意味着 TUI 中的 API 调用实际在 Worker 线程中执行。`createEventSource` 将 Worker 的全局事件推送到主线程——UI 可以实时响应会话状态变化。

### 触发点 5：Worker 线程 — HTTP 服务端启动

**文件**：`cli/cmd/tui/worker.ts:83`

```typescript
await AppRuntime.runPromise(
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const config = yield* cfg.get()
    const serverOpts = resolveNetworkOptionsNoConfig(config.server)
    const server = yield* Server.listen(serverOpts)
    // ... 注册 RPC 方法 ...
  })
)
```

**自然语言解释**：Worker 线程启动后，通过 `AppRuntime.runPromise` 进入 Effect 世界。在 `Effect.gen` 中依次：读取配置 → 解析网络选项 → 启动 HTTP 服务端（默认端口 4096）→ 注册 RPC 方法。`AppRuntime` 是全局 Effect 运行时，提供完整的依赖注入。服务端启动后，Worker 进入事件循环，等待主线程的 RPC 调用。

### 触发点 6：数据库迁移 — JsonMigration.run()

**文件**：`src/index.ts:130` + `storage/json-migration.ts`

```typescript
await JsonMigration.run(
  drizzle({ client: Database.Client().$client }),
  {
    progress: (event) => {
      const percent = Math.floor((event.current / event.total) * 100)
      // 渲染进度条: ■■■■■･････ 42% labels 123/456
    }
  }
)
```

**自然语言解释**：首次运行 opencode 时，需要将旧格式的 JSON 数据迁移到 SQLite 数据库。`JsonMigration.run()` 接收 Drizzle ORM 实例和进度回调。迁移过程包括：读取旧 JSON 文件 → 创建 SQLite 表 → 逐条插入数据 → 更新 schema 版本。进度条在 TTY 模式下用 ANSI 颜色码渲染（橙色进度条 + 灰色标签），非 TTY 模式下输出纯文本。迁移完成后创建 `opencode.db` 标记文件，后续启动跳过迁移。

### 触发点 7：ServeCommand 和 WebCommand — 其他启动模式

**文件**：`cli/cmd/serve.ts` + `cli/cmd/web.ts`

```typescript
// serve: 无头服务端
export const ServeCommand = effectCmd({
  command: "serve",
  handler: Effect.fn("Cli.serve")(function* (args) {
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)
    yield* Effect.never  // 永久等待，保持服务运行
  }),
})

// web: 服务端 + 打开浏览器
export const WebCommand = effectCmd({
  command: "web",
  handler: Effect.fn("Cli.web")(function* (args) {
    const server = yield* Effect.promise(() => Server.listen(opts))
    yield* Effect.promise(() => open(server.url))  // 打开浏览器
    yield* Effect.never
  }),
})
```

**自然语言解释**：除了默认的 TUI 模式，`bun run dev` 也可以带参数启动其他模式。`opencode serve` 启动无头 HTTP 服务端（无 UI），`opencode web` 启动服务端并自动打开浏览器访问 Web 应用。两者都使用 `Effect.never`——这是一个永远不会完成的 Effect，用于保持服务进程持续运行（类似于 `while(true)` 但更优雅，因为它可以被 Effect 运行时管理）。

## 9.5 涉及的 Effect 方法

### `Effect.never`
**作用**：创建一个永远不会完成（也不失败）的 Effect。用于需要"永久运行"的场景——服务端进程需要持续监听请求，不应该退出。

**本章使用场景**：`serve` 和 `web` 命令——服务启动后永久等待。

### `Effect.promise(() => promise)`
**作用**：将 Promise 包装为 Effect。

**本章使用场景**：`Server.listen()` 和 `open()` 返回 Promise，用 `Effect.promise` 包装后在 Effect.gen 中使用。

### `Effect.fn(name, gen)`
**作用**：创建命名的生成器风格 Effect。

**本章使用场景**：`serve` 和 `web` 命令的 handler。

### `AppRuntime.runPromise(effect)`
**作用**：通过全局 Effect 运行时执行 Effect。

**本章使用场景**：Worker 线程启动时执行初始化 Effect。

### `Effect.gen(function*(){})`
**作用**：创建生成器风格 Effect。

**本章使用场景**：Worker 初始化逻辑。

## 9.6 本章小结

`bun run dev` 的启动链路是 opencode 的"全景图"：从 `src/index.ts` 的 yargs CLI 入口开始，经过中间件初始化（日志、Heap、数据库迁移），默认路由到 `TuiThreadCommand`，然后启动双线程架构——主线程负责 TUI 渲染，Worker 线程负责 HTTP 服务端。两者通过 RPC 通信。`Installation.isLocal()` 检测开发模式并影响日志级别和文件命名。`Effect.never` 用于保持服务进程永久运行。理解这个流程等于理解了 opencode 从启动到运行的完整路径。

# 第 1 章 · CLI 命令入口

## 1.1 场景概述

用户执行 `opencode run "修复这个 bug"` 时，从命令行参数解析到实际业务逻辑执行，中间有一个关键的过渡点：**Effect-TS 运行时的启动**。opencode 的所有 CLI 命令都通过 `effectCmd()` 包装器进入 Effect 世界——这个包装器负责加载项目实例上下文、创建 Effect 运行时、然后执行命令的 Effect 处理函数。

为什么需要 Effect？因为 CLI 命令需要访问大量依赖——配置服务、Agent 服务、Provider 服务、文件系统等。Effect 的 Layer 依赖注入机制让这些依赖以类型安全的方式自动可用，而不需要手动传递参数或使用全局变量。

## 1.2 触发流程

```text
用户敲下命令
    │
    ▼
┌─ yargs 解析命令行参数 ─────────────────────────────────────┐
│  解析出: message, model, agent, session, fork, continue... │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ effectCmd() 包装器 (cli/effect-cmd.ts) ──────────────────┐
│                                                            │
│  ① AppRuntime.runPromise(                                 │
│       InstanceStore.Service.use(store => store.load({...})) │
│     )                                                      │
│     加载项目实例上下文 (directory, worktree, project)       │
│                                                            │
│  ② AppRuntime.runPromise(                                 │
│       handler(args).pipe(                                  │
│         Effect.provideService(InstanceRef, ctx)            │
│       )                                                    │
│     )                                                      │
│     将实例上下文注入 Effect 环境，执行命令处理函数           │
│                                                            │
│  ③ AppRuntime.runPromise(                                 │
│       store.dispose(ctx)                                   │
│     )                                                      │
│     命令结束后清理实例资源                                  │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ 具体命令 handler (如 cli/cmd/run.ts) ────────────────────┐
│  在 Effect.gen 中访问所有注入的服务:                        │
│  · Config.Service (配置)                                    │
│  · Agent.Service (Agent 管理)                               │
│  · Provider.Service (模型管理)                              │
│  · SessionPrompt.Service (会话 Prompt)                      │
│  · ... 等 20+ 服务                                          │
└────────────────────────────────────────────────────────────┘
```

## 1.3 关键触发点详解

### 触发点 1：effectCmd 包装器 — 所有 CLI 命令的统一入口

**文件**：`cli/effect-cmd.ts:81-91`

```typescript
// ① 加载实例上下文
const { store, ctx } = await AppRuntime.runPromise(
  Effect.gen(function* () {
    const store = yield* InstanceStore.Service
    const ctx = yield* store.load({ directory: opts.directory })
    return { store, ctx }
  })
)

// ② 注入上下文并执行命令处理函数
await AppRuntime.runPromise(
  opts.handler(args).pipe(
    Effect.provideService(InstanceRef, ctx)
  )
)

// ③ 清理资源
await AppRuntime.runPromise(store.dispose(ctx))
```

**自然语言解释**：`effectCmd` 是 opencode 中所有 CLI 命令的"大门"。它做了三件事：第一，通过 `AppRuntime.runPromise` 启动 Effect 运行时，加载项目实例上下文（包括工作目录、Git worktree 根目录、项目配置信息）；第二，将加载到的上下文通过 `Effect.provideService` 注入到命令处理函数的 Effect 环境中，然后执行处理函数；第三，命令结束后清理实例资源。`AppRuntime` 是全局的 Effect 运行时，它内部组装了完整的依赖注入 Layer 图。

### 触发点 2：opencode run — 最复杂的 CLI 命令

**文件**：`cli/cmd/run.ts:513`

```typescript
const entry = await Effect.runPromise(
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    return yield* cfg.get()
  }).pipe(
    Effect.provide(Config.defaultLayer)
  )
)
```

**自然语言解释**：`opencode run` 命令在启动时需要读取配置。这里没有使用 `AppRuntime`（全局运行时），而是直接用 `Effect.runPromise` 配合 `Effect.provide` 手动注入 `Config.defaultLayer`。这是一种"按需提供依赖"的模式——当只需要一个服务的依赖时，不需要启动完整的全局运行时，只需提供该服务所需的 Layer 即可。

### 触发点 3：opencode agent create — LLM 生成 Agent

**文件**：`cli/cmd/agent.ts:130`

```typescript
const generated = await Effect.runPromise(
  agentSvc.generate({ description, model })
).catch((error) => {
  spinner.stop(`LLM failed to generate agent: ${error.message}`, 1)
  throw new UI.CancelledError()
})
```

**自然语言解释**：`opencode agent create` 命令使用 LLM 自动生成 Agent 配置。`agentSvc.generate()` 返回一个 Effect，内部会调用 LLM API 生成 Agent 的 description、whenToUse 等字段。这里用 `Effect.runPromise` 将 Effect 转换为 Promise，然后用 `.catch()` 处理 LLM 调用失败的情况——如果生成失败，显示错误信息并取消操作。

### 触发点 4：opencode github — Git 操作

**文件**：`cli/cmd/github.ts:207,255,501,508,514,551,566,939`

多处使用 `Effect.runPromise(gitSvc.run(...))` 执行 Git 命令。例如：

```typescript
const providers = await Effect.runPromise(modelsDev.get())
const info = await Effect.runPromise(
  gitSvc.run(["remote", "get-url", "origin"], { cwd: ctx.worktree })
)
const result = await Effect.runPromise(
  gitSvc.run(args, { cwd: ctx.worktree })
)
```

**自然语言解释**：GitHub 集成命令需要频繁执行 Git 操作（获取 remote URL、检查分支状态、创建提交等）。`gitSvc.run()` 返回 Effect（因为 Git 命令可能失败），每次调用都用 `Effect.runPromise` 转换为 Promise 等待结果。这种模式在需要与外部系统交互的命令中非常常见。

### 触发点 5：opencode mcp — MCP OAuth 认证

**文件**：`cli/cmd/mcp.ts:641`

```typescript
const { authStatus, entry } = await Effect.runPromise(
  Effect.gen(function* () {
    const auth = yield* MCPAuth.Service
    const status = yield* auth.status(mcpName, serverUrl)
    const entry = yield* auth.getForUrl(mcpName, serverUrl)
    return { authStatus: status, entry }
  })
)
```

**自然语言解释**：MCP 命令需要检查 OAuth 认证状态。`Effect.gen` 创建了一个生成器风格的 Effect，在其中依次调用 `auth.status()` 和 `auth.getForUrl()`（两者都返回 Effect），然后用 `Effect.runPromise` 一次性执行整个 Effect 块并获取结果。

## 1.4 涉及的 Effect 方法

### `Effect.gen(function* () { ... })`
**作用**：创建生成器风格的 Effect。在生成器函数内使用 `yield*` 来"等待"其他 Effect 完成并获取其结果。这是 opencode 中最常用的 Effect 创建方式。

**本章使用场景**：`effectCmd` 中加载实例上下文、`mcp` 命令中检查认证状态。

### `Effect.runPromise(effect)`
**作用**：将 Effect 转换为 Promise 并立即执行。这是 Effect 世界与 Promise 世界之间的主要桥梁。执行过程中如果 Effect 失败（产生 Error），Promise 会被 reject。

**本章使用场景**：所有 CLI 命令的入口——将 Effect 处理函数转换为可 await 的 Promise。

### `ManagedRuntime.make(layer, options)`
**作用**：从 Layer（依赖注入图）创建一个可复用的 Effect 运行时。运行时提供了 `runPromise`、`runSync`、`runFork` 等方法。

**本章使用场景**：`AppRuntime` 是全局的 `ManagedRuntime` 实例，所有 CLI 命令通过它执行。

### `Layer.provide(layer, target)`
**作用**：将 layer 的依赖注入到 target layer 中，形成新的 Layer。用于构建依赖注入图。

**本章使用场景**：`Config.defaultLayer` 等各服务 Layer 被组合成完整的 `AppLayer`。

### `Effect.provideService(tag, value)`
**作用**：向 Effect 环境中注入一个具体的服务实例。与 `Layer.provide` 不同，这是直接注入值而非 Layer。

**本章使用场景**：`effectCmd` 中将加载到的 `InstanceRef`（实例上下文）注入到命令处理函数的 Effect 环境中。

### `Effect.catch(error, handler)`
**作用**：捕获 Effect 执行中的特定错误类型，并执行恢复逻辑。

**本章使用场景**：`agent create` 命令中捕获 LLM 生成失败的错误。

### `Effect.die(error)`
**作用**：将错误作为"缺陷"（defect）抛出。与普通错误不同，缺陷被视为不可恢复的 bug。

**本章使用场景**：当模型未找到等不可恢复的错误发生时。

## 1.5 本章小结

CLI 命令入口是 opencode 中 Effect 代码被触发的"第一道门"。`effectCmd()` 包装器统一了所有命令的 Effect 启动流程：加载实例上下文 → 注入依赖 → 执行处理函数 → 清理资源。`AppRuntime`（全局 `ManagedRuntime`）是执行这些 Effect 的引擎。对于只需要少量依赖的简单场景，也可以直接用 `Effect.runPromise` + `Effect.provide` 手动注入依赖。

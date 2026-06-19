# 第 8 章 · 桥接层

## 8.1 场景概述

opencode 的核心逻辑全部用 Effect-TS 编写，但它必须与大量外部代码交互——AI SDK（`ai` 包）期望 Promise、Node.js API 返回 Promise、CLI 框架（yargs）是同步的、文件系统事件是回调式的。桥接层（`effect/bridge.ts`）提供了四种标准化的 Effect ↔ 外部世界转换模式，让 Effect 代码可以无缝嵌入非 Effect 的上下文中。

为什么需要桥接层？直接在每个调用点手动 `Effect.runPromise` 或 `Effect.promise` 会导致代码重复和错误处理不一致。桥接层统一了转换逻辑，并额外处理了 Workspace 上下文恢复（确保异步回调中能访问正确的项目上下文）。

## 8.2 四种桥接模式

```text
┌─────────────────────────────────────────────────────────────┐
│                    EffectBridge 四种模式                      │
│                                                             │
│  ① bridge.promise(effect)                                   │
│     Effect ──────────→ Promise                              │
│     用途: 将 Effect 暴露给 AI SDK、CLI 等外部代码            │
│     场景: 工具 execute()、事件分发、后台任务                  │
│                                                             │
│  ② bridge.fork(effect)                                      │
│     Effect ──────────→ Fiber (后台执行)                      │
│     用途: 启动后台 Effect，不等待结果                         │
│     场景: 非关键的后台操作                                    │
│                                                             │
│  ③ bridge.sync(fn)                                          │
│     同步函数 ──────────→ Effect                              │
│     用途: 将同步函数包装为 Effect（恢复 Workspace 上下文）     │
│     场景: 在异步回调中执行需要项目上下文的同步操作             │
│                                                             │
│  ④ EffectBridge.fromPromise(fn)                              │
│     Promise ──────────→ Effect                               │
│     用途: 将外部 Promise 包装为 Effect（恢复 Workspace 上下文）│
│     场景: Workspace Adapter、Command 模板加载                 │
└─────────────────────────────────────────────────────────────┘
```

## 8.3 关键触发点详解

### 触发点 1：bridge.promise — Effect → Promise（最常用）

**文件**：`effect/bridge.ts:65`

```typescript
promise<T>(effect: Effect.Effect<T, never, never>): Promise<T> {
  return restoreWorkspace(
    workspace,
    () => Effect.runPromise(wrap(effect))
  )
}
```

**自然语言解释**：`bridge.promise` 是 opencode 中使用最频繁的桥接方法。它做了三件事：第一，`wrap(effect)` 将 Effect 包装（添加 Workspace 上下文恢复逻辑）；第二，`Effect.runPromise` 执行 Effect 并返回 Promise；第三，`restoreWorkspace` 确保在 Effect 执行期间，Workspace 上下文（当前项目信息）被正确设置。这个模式在工具执行中无处不在——每个工具的 `execute` 函数都通过 `bridge.promise` 将 Effect 执行逻辑暴露给 AI SDK。

### 触发点 2：bridge.fork — Effect → 后台 Fiber

**文件**：`effect/bridge.ts:67`

```typescript
fork<T>(effect: Effect.Effect<T, never, never>): void {
  return restoreWorkspace(
    workspace,
    () => Effect.runFork(wrap(effect))
  )
}
```

**自然语言解释**：`bridge.fork` 将 Effect 作为后台 Fiber 启动，不返回结果。与 `bridge.promise` 不同，调用者不等待 Effect 完成——适合"fire-and-forget"场景。`Effect.runFork` 启动 Fiber 后立即返回，Fiber 在后台独立运行。Workspace 上下文同样被恢复，确保后台任务能访问正确的项目信息。

### 触发点 3：bridge.sync — 同步函数 → Effect

**文件**：`effect/bridge.ts:79`

```typescript
sync<Args extends any[], R>(
  fn: (...args: Args) => R
): (...args: Args) => R {
  return (...args) =>
    restoreWorkspace(
      workspace,
      () => Effect.runSync(
        wrap(Effect.sync(() => fn(...args)))
      )
    )
}
```

**自然语言解释**：`bridge.sync` 将同步函数包装为在 Effect 上下文中执行的版本。原始函数 `fn` 被 `Effect.sync` 包装为 Effect（不会失败），然后 `Effect.runSync` 同步执行。关键是 `restoreWorkspace`——即使调用发生在异步回调中（此时 Node.js 的 ALS 上下文可能已丢失），Workspace 上下文也被正确恢复。这解决了"在异步回调中访问项目配置"的常见问题。

### 触发点 4：EffectBridge.fromPromise — Promise → Effect（反向桥接）

**文件**：`effect/bridge.ts:51`

```typescript
static fromPromise<T>(
  fn: () => Promise<T>
): Effect.Effect<T, never, never> {
  return Effect.gen(function* () {
    const workspace = yield* WorkspaceContext.use()
    return yield* Effect.promise(() =>
      Promise.resolve(
        restoreWorkspace(workspace, () => fn())
      )
    )
  })
}
```

**自然语言解释**：`EffectBridge.fromPromise` 是反向桥接——将外部 Promise 函数包装为 Effect。它在 Effect 上下文中执行，先获取当前 Workspace 上下文，然后通过 `Effect.promise` 包装 Promise，在 Promise 执行前恢复 Workspace 上下文。这个模式用于 Workspace Adapter（`control-plane/workspace-adapter-runtime.ts`）——外部 Adapter 的方法返回 Promise，但需要在 Effect 上下文中调用。

### 触发点 5：Workspace Adapter — 外部 Promise → Effect 的批量桥接

**文件**：`control-plane/workspace-adapter-runtime.ts:18-48`

```typescript
target(info: Info, ctx: InstanceContext) {
  return EffectBridge.fromPromise(() =>
    adapter.target(info, ctx)
  )
}

configure(info: Info, ctx: InstanceContext) {
  return EffectBridge.fromPromise(() =>
    adapter.configure(info, ctx)
  )
}

create(info: Info, env: Record<string, string>, from?: string, ctx?: InstanceContext) {
  return EffectBridge.fromPromise(() =>
    adapter.create(info, env, from, ctx)
  )
}
```

**自然语言解释**：Workspace Adapter 是外部提供的模块（如 Git Worktree Adapter），其方法返回 Promise。`workspace-adapter-runtime.ts` 用 `EffectBridge.fromPromise` 将每个 Adapter 方法包装为 Effect，使其可以在 opencode 的 Effect 体系中被调用。这种批量桥接模式让外部模块无缝集成到 Effect 世界中。

### 触发点 6：Command 模板加载 — 桥接的另一种形式

**文件**：`command/index.ts:74`

```typescript
const bridge = yield* EffectBridge.make()
// 使用 bridge 执行需要 Workspace 上下文的操作
```

**自然语言解释**：Command 系统在加载命令模板时需要访问文件系统（读取 `.opencode/command/` 下的 Markdown 文件）。这些操作在 Effect 上下文中执行，但命令模板的解析和参数替换涉及同步字符串操作。`EffectBridge.make()` 创建桥接器，让 Command 系统可以在 Effect 上下文中自由使用 `bridge.promise` 和 `bridge.sync`。

## 8.4 涉及的 Effect 方法

### `EffectBridge.make()`
**作用**：创建 Effect 桥接器实例。桥接器绑定到当前 Workspace 上下文，确保所有桥接操作都能访问正确的项目信息。

**本章使用场景**：工具执行、事件总线、文件监听、Command 系统——几乎所有需要 Effect ↔ 外部世界转换的场景。

### `bridge.promise(effect)`
**作用**：将 Effect 转换为 Promise。恢复 Workspace 上下文后执行 Effect。

**本章使用场景**：工具 execute()、事件分发循环——最常用的桥接模式。

### `bridge.fork(effect)`
**作用**：将 Effect 作为后台 Fiber 启动，不返回结果。

**本章使用场景**：非关键的后台操作。

### `bridge.sync(fn)`
**作用**：将同步函数包装为在 Effect 上下文中执行的版本。

**本章使用场景**：异步回调中需要访问项目上下文的同步操作。

### `EffectBridge.fromPromise(fn)`
**作用**：将外部 Promise 函数包装为 Effect。在 Effect 上下文中调用，自动恢复 Workspace 上下文。

**本章使用场景**：Workspace Adapter 集成——将外部模块的 Promise 方法包装为 Effect。

### `Effect.runPromise(effect)`
**作用**：执行 Effect 并返回 Promise。

**本章使用场景**：`bridge.promise` 的底层实现。

### `Effect.runFork(effect)`
**作用**：将 Effect 作为 Fiber 启动，立即返回不等待。

**本章使用场景**：`bridge.fork` 的底层实现。

### `Effect.runSync(effect)`
**作用**：同步执行 Effect。

**本章使用场景**：`bridge.sync` 的底层实现。

### `Effect.promise(() => promise)`
**作用**：将 Promise 包装为 Effect。

**本章使用场景**：`EffectBridge.fromPromise` 的底层实现。

### `Effect.sync(() => value)`
**作用**：创建同步 Effect（不会失败）。

**本章使用场景**：`bridge.sync` 中将同步函数包装为 Effect。

### `Effect.runPromiseExit(effect)`
**作用**：执行 Effect 并返回 `Exit` 对象（不抛异常）。

**本章使用场景**：`bridge.ts:71`——服务停止时使用，忽略失败结果。

## 8.5 本章小结

桥接层是 opencode 中 Effect 世界与外部世界之间的"翻译官"。四种标准化的桥接模式覆盖了所有互操作场景：`bridge.promise`（Effect → Promise）用于工具执行和事件分发，`bridge.fork`（Effect → Fiber）用于后台任务，`bridge.sync`（同步函数 → Effect）用于异步回调中的上下文恢复，`EffectBridge.fromPromise`（Promise → Effect）用于外部模块集成。所有桥接模式都自动处理 Workspace 上下文恢复——这是 opencode 特有的需求：确保在任何执行上下文中都能访问正确的项目信息。

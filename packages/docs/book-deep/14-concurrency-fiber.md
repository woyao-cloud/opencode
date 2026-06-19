# 第 14 章：并发控制与 Fiber 管理

> **本章目标**：理解 opencode 中的三种并发场景，掌握 `Effect.forkIn`/`forkScoped`/`forkChild` 的选择策略，学习 `InstanceState` 的多实例隔离和 `EffectBridge` 的 Effect ↔ Promise 桥接。
> **涉及文件**：`packages/opencode/src/effect/instance-state.ts`、`bridge.ts`、`runner.ts`
> **必备知识**：第 6-7 章的 Fiber 基础、Node.js 事件循环

---

## 14.1 场景引入：三个并发场景

opencode 中有三种典型的并发场景：

**场景一：并行工具执行。** LLM 同时调用了 `read` 和 `grep` 两个工具。它们互不依赖，应该同时执行以节省时间。但如果 LLM 调用了 `write` 和 `read` 同一个文件，就需要顺序执行（先写后读）。

**场景二：后台摘要生成。** 每次对话开始时，opencode 在后台生成对话标题和摘要。用户不需要等待这个操作——它可以在后台运行，结果在需要时（如会话列表）使用。

**场景三：多项目同时使用。** 用户可能同时打开两个终端，在两个不同的项目目录中使用 opencode。每个项目有自己的 Git 仓库、LSP 服务器、MCP 连接。这些资源必须按目录隔离——项目 A 的 LSP 不能分析项目 B 的文件。

这三种场景对应 Effect 并发控制的三个核心能力：并行执行、后台 Fork、资源隔离。

---

## 14.2 核心概念

### 三种 Fork 方式的选择

| 方式 | 生命周期 | 父 Fiber 行为 | 使用场景 |
|------|----------|---------------|----------|
| `Effect.fork` | 独立运行 | 不等待，不自动中断 | 不推荐（容易泄漏） |
| `Effect.forkIn(scope)` | 绑定到指定 Scope | Scope 关闭时自动中断 | 后台任务（摘要生成、定期清理） |
| `Effect.forkScoped` | 绑定到当前 Scope | 当前 Scope 关闭时自动中断 | 临时子任务 |
| `Effect.forkChild` | 绑定到父 Fiber | 父 Fiber 退出前自动等待/中断 | 子 Agent 任务 |

选择原则：
- 需要等待结果 → `forkChild`（父等子）
- 不需要等待，但需要自动清理 → `forkIn(scope)` 或 `forkScoped`
- 不需要等待也不需要清理 → 几乎不存在这种场景

### InstanceState：按目录隔离的服务实例

`packages/opencode/src/effect/instance-state.ts` 是 opencode 多项目隔离的核心。它基于 `ScopedCache` 实现：

```typescript
// 简化的 InstanceState 逻辑
export const make = <A, E, R>(init: (ctx: InstanceContext) => Effect<A, E, R | Scope>) =>
  Effect.gen(function* () {
    // 1. 创建 ScopedCache（按目录 key 缓存）
    const cache = yield* ScopedCache.make({
      capacity: Infinity,
      lookup: (dir) => init(yield* context),  // 每个目录独立初始化
    })

    // 2. 注册清理回调（目录关闭时自动清理）
    const off = registerDisposer((dir) =>
      Effect.runPromise(ScopedCache.invalidate(cache, dir))
    )
    yield* Effect.addFinalizer(() => Effect.sync(off))

    return { cache }
  })
```

每个项目目录在 `ScopedCache` 中有一个独立的条目。当用户切换到不同目录时，opencode 自动切换对应的服务实例（Git、LSP、MCP 等）。当项目关闭时，`ScopedCache.invalidate` 自动清理该目录的所有资源。

### EffectBridge：原生回调与 Effect 的桥接

`packages/opencode/src/effect/bridge.ts` 解决了 Effect 世界与 Node.js 原生生态的互操作问题。许多 Node.js 库（如 `@parcel/watcher`、`node-pty`）使用回调式 API，`EffectBridge` 将它们桥接到 Effect 世界：

```typescript
// 简化的 EffectBridge 逻辑
export function make(): Effect.Effect<Shape> {
  return Effect.gen(function* () {
    return {
      // Promise 桥接：将 Effect 转为 Promise（保留上下文）
      promise: (effect) => restoreWorkspace(workspace, () => Effect.runPromise(wrap(effect))),

      // Fork 桥接：在 Effect 世界中 Fork 一个 Promise 回调
      fork: (effect) => restoreWorkspace(workspace, () => Effect.runFork(wrap(effect))),

      // Callback 桥接：将回调式函数转为 Effect
      bind: (fn) => (...args) => restoreWorkspace(workspace, () =>
        Effect.runSync(wrap(Effect.sync(() => fn(...args))))
      ),
    }
  })
}
```

关键设计：`restoreWorkspace` 在桥接时保留 `WorkspaceContext`（当前项目目录的 ALS 上下文），确保回调执行时能访问正确的项目资源。

---

## 14.3 Effect-TS 函数详解

### `Fiber` — 用户态绿色线程

```
类型签名（简化）:
  Fiber<A, E> — 正在执行的 Effect 的句柄
  Fiber.join(fiber): Effect<A, E>
  Fiber.interrupt(fiber): Effect<Exit<A, E>>
  Fiber.await(fiber): Effect<Exit<A, E>>
```

**用途**：Fiber 是 Effect 的并发原语。与 OS 线程的关键区别：

| 特性 | OS 线程 | Fiber |
|------|---------|-------|
| 创建成本 | ~1ms + 栈分配 | ~微秒级 |
| 调度 | 内核态抢占式 | 用户态协作式 |
| 数量上限 | 数千 | 数百万 |
| 通信 | 共享内存 + 锁 | 类型安全的值传递 |
| 中断 | `Thread.interrupt()`（不可靠） | `Fiber.interrupt()`（可靠） |

**在 opencode 中的使用**：每个子 Agent 在独立 Fiber 中运行，`InstanceState` 通过 `Context.Reference` 在 Fiber 间传播实例上下文。

### `ScopedCache` — 带 Scope 的缓存

```
类型签名（简化）:
  ScopedCache.make<K, V>(options): Effect<ScopedCache<K, V>>
  ScopedCache.get(cache, key): Effect<V>
  ScopedCache.invalidate(cache, key): Effect<void>
```

**用途**：一个缓存，其中每个条目绑定到创建它的 Scope。Scope 关闭时，对应的缓存条目自动清理。

**在 opencode 中的使用**：`InstanceState` 基于 `ScopedCache` 实现——每个项目目录的缓存条目绑定到该目录的 Scope，目录关闭时自动清理。

### `Semaphore` — 并发许可控制

```
类型签名（简化）:
  Semaphore.make(permits: number): Effect<Semaphore>
  Semaphore.withPermits(semaphore, permits: number)(effect): Effect<A, E, R>
```

**用途**：限制同时执行的 Effect 数量。`withPermits(1)` 等价于互斥锁（Mutex）。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：没有标准并发控制原语
// 需要手动实现 Mutex 或使用第三方库

// Effect-TS：Semaphore
const sem = yield* _(Semaphore.make(1))  // 互斥锁
yield* _(sem.withPermits(1)(criticalSection()))
// 同时只有一个 Fiber 能进入 criticalSection
```

**在 opencode 中的使用**：快照系统用 `Semaphore(1)` 序列化对同一 Git 仓库的并发操作。

### `Context.Reference` — Fiber 本地上下文

```
类型签名（简化）:
  Context.Reference<A>("name", { defaultValue: () => A }): Context.Reference<A>
  Context.getReferenceUnsafe(fiberContext, ref): A | undefined
```

**用途**：在 Fiber 的 Context 中存储可变的、Fiber 本地的值。类似 Java 的 `ThreadLocal`，但用于 Fiber。

**在 opencode 中的使用**：`InstanceRef` 和 `WorkspaceRef` 是 `Context.Reference`，携带当前项目目录的身份信息，通过 `attach()` 自动传播到所有 Effect 执行中。

### `Effect.callback` — 回调式 API 转 Effect

```
类型签名（简化）:
  Effect.callback<A, E>(resume: (cb: (result: Exit<A, E>) => void) => void | Disposable): Effect<A, E>
```

**用途**：将回调式 API 包装为 Effect。`resume` 函数接收一个回调，当回调被调用时，Effect 完成。

**在 opencode 中的使用**：`EffectBridge` 用 `Effect.callback` 将 `@parcel/watcher` 的文件变更回调转为 Effect Stream。

---

## 14.4 实现剖析

### 并行工具执行

`processor.ts` 中，当 LLM 同时发起多个 tool-call 时，opencode 并行执行它们：

```typescript
// 等待所有 toolcall 完成（并行）
yield* Effect.forEach(
  Object.values(ctx.toolcalls),
  (call) => Deferred.await(call.done).pipe(
    Effect.timeout("250 millis"),
    Effect.ignore,
  ),
  { concurrency: "unbounded" },
)
```

每个 toolcall 有一个 `Deferred`，工具执行完成时 `succeed`。`Effect.forEach({ concurrency: "unbounded" })` 同时等待所有 `Deferred`。

### 后台摘要生成

摘要生成通过 `Effect.forkIn(scope)` 在后台执行：

```typescript
yield* summary.summarize(sessionID).pipe(
  Effect.ignore,          // 忽略错误（摘要是可选的）
  Effect.forkIn(scope),   // 在 Scope 中 Fork
)
```

用户不需要等待摘要完成——它在后台运行。如果用户关闭会话，Scope 关闭，后台摘要自动中断。

### InstanceState 的多实例隔离

当用户切换到不同项目目录时：

1. `InstanceRef` 更新为新的 `InstanceContext`（包含目录路径、项目 ID）
2. 后续 `yield*` 提取服务时，`ScopedCache` 自动查找或创建对应目录的服务实例
3. 旧目录的 Scope 关闭时，`ScopedCache.invalidate` 清理该目录的所有资源（Git 连接、LSP 进程、MCP 连接）

---

## 14.5 开发人员必备知识与技能

1. **Fiber 模型理解** — Fiber 不是线程，是用户态调度的协程。关键特性：创建成本极低（可以同时存在百万个）、协作式调度（只在 `yield*` 点切换）、可靠的中断机制（`onInterrupt` 保证清理）。

2. **并发控制策略** — `concurrency: "unbounded"` 适合独立任务（并行工具执行），`concurrency: N` 适合有资源限制的任务（如限制同时打开的数据库连接数），`Semaphore` 适合需要互斥访问的场景（如 Git 操作）。

3. **Effect 与 Node.js 生态桥接** — `EffectBridge` 是桥接 Effect 世界和 Node.js 回调世界的标准模式。关键点：桥接时保留 Context（`InstanceRef`、`WorkspaceRef`），确保回调执行时能访问正确的资源。

4. **多租户隔离** — `InstanceState` + `ScopedCache` 是 Effect 实现多租户隔离的标准模式。每个租户（项目目录）有独立的资源实例，租户关闭时自动清理。

---

## 14.6 本章小结

- opencode 有三种并发场景：并行工具执行、后台摘要生成、多项目隔离
- `forkChild`（父等子）、`forkIn(scope)`（Scope 管理生命周期）、`forkScoped`（当前 Scope）各有适用场景
- `InstanceState` 基于 `ScopedCache` 实现按目录隔离的服务实例，目录关闭时自动清理
- `EffectBridge` 桥接 Effect 世界和 Node.js 回调世界，保留 `WorkspaceContext`
- `Semaphore` 序列化 Git 操作，`Context.Reference` 传播实例上下文
- `Effect.callback` 将回调式 API 转为 Effect，`Effect.forEach({ concurrency })` 控制并行度

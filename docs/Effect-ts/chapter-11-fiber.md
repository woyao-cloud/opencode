# 第 11 章：Fiber — 轻量级并发执行单元

## 一、本章概述

Fiber 是 Effect-TS 中轻量级并发执行单元，类似于操作系统线程但开销极低。在 Effect-TS 中，每个并发执行的任务都是一个 Fiber，它们由 Effect 运行时调度，支持结构化并发、取消和资源安全。

本章将介绍 Fiber 的四个核心概念：

1. **Fiber vs Promise** — 理解 Fiber 与 Promise 的本质区别：惰性创建、可取消、结构化并发
2. **Fork / Join / Interrupt** — Fiber 的创建、等待、中断、轮询等操作
3. **Fiber 生命周期** — 从 Suspended 到 Running 到 Done 的状态转换
4. **结构化并发** — 使用 Scope 管理 Fiber 生命周期，自动清理

### 前置知识

- 第 2 章 Effect 基础：理解 `Effect`、`Effect.gen`、`Effect.runPromise`
- 第 6 章 Scope：理解 `Scope`、`Effect.scoped`、资源生命周期管理

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch11-fiber/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch11-fiber
bun install
bun run demo:vs-promise    # Fiber vs Promise
bun run demo:fork-join     # Fork / Join / Interrupt
bun run demo:lifecycle     # Fiber 生命周期
bun run demo:structured    # 结构化并发
```

---

## 二、核心概念

### 2.1 什么是 Fiber

Fiber 是 Effect-TS 中的轻量级并发执行单元。每个 `Effect` 在被 fork 后会在一个 Fiber 中执行。Fiber 具有以下特性：

- **轻量级**：比 OS 线程轻量得多，可以创建数百万个
- **结构化并发**：父 Fiber 管理子 Fiber 的生命周期
- **可取消**：Fiber 可以在任意点被安全地中断
- **协作式**：Fiber 在 Effect 边界主动让出控制权
- **可追踪**：每个 Fiber 有唯一 ID，便于调试和监控

```typescript
import { Effect, Fiber } from "effect"

// forkChild 创建一个子 Fiber
const program = Effect.gen(function* () {
  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("1 second")
      return "后台任务结果"
    }),
  )

  // 继续执行其他工作
  yield* Effect.sleep("500 millis")

  // 等待 Fiber 完成
  const result = yield* Fiber.join(fiber)
  console.log(result) // "后台任务结果"
})
```

### 2.2 Fiber 与 Promise 的对比

| 特性 | Promise | Fiber |
|------|---------|-------|
| 创建时机 | 创建即执行 | 惰性，fork 后才执行 |
| 取消能力 | 不可取消 | 可中断（interrupt） |
| 结构化并发 | 不支持 | 父子生命周期管理 |
| 错误处理 | catch 链 | Exit 类型 + Cause |
| 资源安全 | 需手动管理 | Scope 自动清理 |

### 2.3 关键 API

| API | 类型签名 | 说明 |
|-----|---------|------|
| `Effect.forkChild` | `(effect) => Effect<Fiber>` | 创建子 Fiber（结构化并发） |
| `Effect.forkScoped` | `(effect) => Effect<Fiber>` | 创建绑定到当前 Scope 的 Fiber |
| `Effect.forkDetach` | `(effect) => Effect<Fiber>` | 创建脱离父 Fiber 的独立 Fiber |
| `Effect.forkIn` | `(scope) => (effect) => Effect<Fiber>` | 在指定 Scope 中创建 Fiber |
| `Fiber.join` | `(fiber) => Effect<A, E>` | 等待 Fiber 完成并获取结果 |
| `Fiber.interrupt` | `(fiber) => Effect<void>` | 中断 Fiber 执行 |
| `Fiber.interruptAs` | `(fiber, id) => Effect<void>` | 使用指定 FiberId 中断 |
| `Fiber.await` | `(fiber) => Effect<Exit>` | 等待 Fiber 完成，返回 Exit |
| `Fiber.awaitAll` | `(fibers) => Effect<Exit[]>` | 等待多个 Fiber 完成 |
| `Fiber.pollUnsafe` | `() => Exit \| undefined` | 非阻塞检查 Fiber 状态 |
| `FiberSet.make` | `() => Effect<FiberSet>` | 创建 Fiber 集合 |
| `FiberSet.add` | `(set, fiber) => Effect<void>` | 添加 Fiber 到集合 |
| `FiberSet.join` | `(set) => Effect<void>` | 等待集合中所有 Fiber 完成 |

---

## 三、Fiber vs Promise

### 3.1 创建时机

Promise 创建后立即开始执行，而 Effect 是惰性的 — 只有在 fork 后才会开始执行：

```typescript
// Promise 创建即执行
const promise = new Promise((resolve) => {
  console.log("Promise 创建时立即执行！")
  setTimeout(() => resolve("结果"), 100)
})

// Effect 是惰性的
const effect = Effect.gen(function* () {
  console.log("fork 后才开始执行！")
  yield* Effect.sleep("100 millis")
  return "结果"
})

// 需要 fork 后 Effect 才开始执行
const fiber = yield* Effect.forkChild(effect)
const result = yield* Fiber.join(fiber)
```

### 3.2 取消能力

Fiber 可以被中断，而 Promise 一旦创建就无法取消：

```typescript
const fiber = yield* Effect.forkChild(
  Effect.gen(function* () {
    yield* Effect.sleep("5 seconds")
    return "结果"
  }),
)

// 1 秒后中断 Fiber
yield* Effect.sleep("1 second")
yield* Fiber.interrupt(fiber)

// Fiber 被中断后，await 返回 Failure Exit
const exit = yield* Fiber.await(fiber)
// exit._tag === "Failure"
```

### 3.3 结构化并发

Fiber 支持父子生命周期管理。当父 Fiber 被中断时，子 Fiber 也会被自动中断：

```typescript
const parentTask = Effect.gen(function* () {
  // forkChild 创建子 Fiber
  const child1 = yield* Effect.forkChild(task("A"))
  const child2 = yield* Effect.forkChild(task("B"))

  // 等待所有子 Fiber 完成
  const r1 = yield* Fiber.join(child1)
  const r2 = yield* Fiber.join(child2)
})

// 如果父 Fiber 被中断，子 Fiber 也会被自动中断
```

### 3.4 forkDetach — 脱离父 Fiber

`forkDetach` 创建的 Fiber 不受父 Fiber 生命周期影响，即使父 Fiber 结束，它也会继续运行：

```typescript
const detached = yield* Effect.forkDetach(
  Effect.gen(function* () {
    yield* Effect.sleep("1 second")
    console.log("父 Fiber 已结束，但我还在运行！")
    return "detached"
  }),
)
// 父 Fiber 结束，但 detached Fiber 继续运行
```

---

## 四、Fork / Join / Interrupt

### 4.1 fork + join

`forkChild` 创建子 Fiber，`Fiber.join` 等待 Fiber 完成并获取结果：

```typescript
const fiber = yield* Effect.forkChild(
  Effect.gen(function* () {
    yield* Effect.sleep("500 millis")
    return 42
  }),
)

// 继续做其他工作...
yield* Effect.sleep("200 millis")

// 等待 Fiber 结果
const result = yield* Fiber.join(fiber)
// result === 42
```

### 4.2 await — 返回 Exit

`Fiber.await` 与 `join` 类似，但返回 `Exit` 类型而不是直接传播错误。这使得调用方可以安全地检查 Fiber 的完成状态：

```typescript
const successFiber = yield* Effect.forkChild(Effect.succeed("成功"))
const failFiber = yield* Effect.forkChild(Effect.fail("失败"))

// await 返回 Exit，不会抛出错误
const successExit = yield* Fiber.await(successFiber)
const failExit = yield* Fiber.await(failFiber)

// Exit.isSuccess(successExit) === true
// Exit.isFailure(failExit) === true
```

### 4.3 interrupt

`Fiber.interrupt` 中断 Fiber 执行。被中断的 Fiber 会收到 `InterruptedException`：

```typescript
const fiber = yield* Effect.forkChild(
  Effect.gen(function* () {
    yield* Effect.sleep("5 seconds")
    return "完成"
  }),
)

yield* Effect.sleep("300 millis")
yield* Fiber.interrupt(fiber)

const exit = yield* Fiber.await(fiber)
// Exit.hasInterrupts(exit) === true
```

### 4.4 interruptAs

`Fiber.interruptAs` 使用指定的 FiberId 来中断，这在调试时很有用 — 可以追踪是谁发起了中断：

```typescript
const customFiberId = 999
yield* Fiber.interruptAs(fiber, customFiberId)
```

### 4.5 poll — 非阻塞检查

`fiber.pollUnsafe()` 是非阻塞方法，立即返回 Fiber 的完成状态：

```typescript
// 立即 poll — Fiber 可能还没完成
const result = fiber.pollUnsafe()
// result === undefined (还在运行中)

// 等待 Fiber 完成后再次 poll
yield* Fiber.join(fiber)
const finalResult = fiber.pollUnsafe()
// finalResult !== undefined (已完成)
```

### 4.6 批量操作

`Fiber.awaitAll` 等待多个 Fiber 完成，返回 `Exit` 数组：

```typescript
const fibers = yield* Effect.all([
  Effect.forkChild(fastTask),
  Effect.forkChild(mediumTask),
  Effect.forkChild(slowTask),
])

const exits = yield* Fiber.awaitAll(fibers)
for (const exit of exits) {
  if (Exit.isSuccess(exit)) {
    console.log(`Fiber 结果: ${exit.value}`)
  }
}
```

---

## 五、Fiber 生命周期

### 5.1 状态转换

Fiber 的生命周期包含三个主要状态：

```
Suspended（挂起）→ Running（运行中）→ Done（完成）
                                              ├─ Success（成功）
                                              ├─ Failure（失败）
                                              └─ Interrupted（中断）
```

- **Suspended**：Fiber 已创建但尚未开始执行
- **Running**：Fiber 正在执行 Effect
- **Done**：Fiber 已完成执行，通过 `Exit` 类型表示结果

### 5.2 观察 Fiber 状态

通过 `fiber.pollUnsafe()` 可以非阻塞地检查 Fiber 是否完成：

```typescript
const fiber = yield* Effect.forkChild(someTask)

// 刚 fork 后 — Fiber 还在 Running
let status = fiber.pollUnsafe()
// status === undefined

// 等待 Fiber 完成后
yield* Fiber.join(fiber)
status = fiber.pollUnsafe()
// status !== undefined (Done)
```

### 5.3 addObserver — 完成回调

Fiber 支持注册完成回调，当 Fiber 完成时自动触发：

```typescript
fiber.addObserver((exit) => {
  if (Exit.isSuccess(exit)) {
    console.log(`Fiber 成功完成，值: ${exit.value}`)
  } else {
    console.log(`Fiber 失败: ${exit.cause}`)
  }
})
```

### 5.4 FiberSet — 管理多个 Fiber

`FiberSet` 是一个受 Scope 管理的 Fiber 集合，当 Scope 关闭时所有 Fiber 自动中断：

```typescript
const fiberSet = yield* FiberSet.make()

// 添加多个 Fiber 到集合
const f1 = yield* Effect.forkChild(task1)
yield* FiberSet.add(fiberSet, f1)

const f2 = yield* Effect.forkChild(task2)
yield* FiberSet.add(fiberSet, f2)

// 等待所有 Fiber 完成
yield* FiberSet.join(fiberSet)

// 检查 FiberSet 大小
const size = yield* FiberSet.size(fiberSet)
```

### 5.5 成功与失败路径

Fiber 可以成功完成、失败或中断。通过 `Exit` 类型可以区分这三种情况：

```typescript
// 成功 Fiber
const successFiber = yield* Effect.forkChild(Effect.succeed("成功值"))
const successExit = yield* Fiber.await(successFiber)
// successExit._tag === "Success"

// 失败 Fiber
const failFiber = yield* Effect.forkChild(Effect.fail(new Error("出错了")))
const failExit = yield* Fiber.await(failFiber)
// failExit._tag === "Failure"
```

---

## 六、结构化并发

### 6.1 结构化并发的核心原则

结构化并发是 Effect-TS 并发模型的核心原则：

1. **Fiber 的生命周期不能超过其创建者的生命周期**
2. **父 Fiber 中断时，子 Fiber 自动中断**
3. **资源清理是确定性的**

### 6.2 forkIn(scope)

`Effect.forkIn(scope)` 在指定 Scope 中创建 Fiber。当 Scope 关闭时，Fiber 自动中断：

```typescript
// 手动创建 Scope
const scope = yield* Scope.make()

// 在 Scope 中 fork Fiber
const fiber = yield* Effect.forkIn(scope)(
  Effect.gen(function* () {
    yield* Effect.sleep("2 seconds")
    return "scope fiber"
  }),
)

// 关闭 Scope — Fiber 会被自动中断
yield* Scope.close(scope, Exit.void)

const exit = yield* Fiber.await(fiber)
// Exit.hasInterrupts(exit) === true
```

### 6.3 forkScoped

`Effect.forkScoped` 自动将 Fiber 绑定到当前 Scope。当 `Effect.scoped` 创建的 Scope 关闭时，Fiber 自动中断：

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    // forkScoped 自动绑定到当前 Scope
    const fiber = yield* Effect.forkScoped(
      Effect.gen(function* () {
        yield* Effect.sleep("3 seconds")
        return "scoped"
      }),
    )

    // 退出 scoped 块时，Scope 关闭，Fiber 自动中断
  }),
)
```

### 6.4 任务管理器模式

参考 OpenCode 中 `runner.ts` 的 Fiber+Deferred+SynchronizedRef 状态机模式，可以实现一个简化版的任务管理器：

```typescript
class TaskManager<A, E> {
  private state: TaskState<A, E> = { _tag: "Idle" }

  start(work: Effect.Effect<A, E>): Effect.Effect<A, E> {
    if (this.state._tag === "Running") {
      // 已有运行中的任务 — 等待它完成
      return Deferred.await(this.state.done)
    }
    return Effect.gen(function* () {
      const done = yield* Deferred.make<A, E>()
      const fiber = yield* Effect.forkChild(
        work.pipe(
          Effect.onExit((exit) => Deferred.done(done, exit)),
        ),
      )
      this.state = { _tag: "Running", fiber, done }
      return yield* Deferred.await(done)
    })
  }

  cancel(): Effect.Effect<void> {
    if (this.state._tag === "Running") {
      this.state = { _tag: "Idle" }
      return Fiber.interrupt(this.state.fiber)
    }
    return Effect.void
  }
}
```

### 6.5 OpenCode 中的 Fiber 模式

在 OpenCode 的 `runner.ts` 中，Fiber 与 Deferred、SynchronizedRef 结合使用，实现了一个完整的状态机：

```typescript
// 状态定义
type State<A, E> =
  | { _tag: "Idle" }
  | { _tag: "Running"; run: RunHandle<A, E> }
  | { _tag: "Shell"; shell: ShellHandle<A, E> }
  | { _tag: "ShellThenRun"; shell: ShellHandle<A, E>; run: PendingHandle<A, E> }

// 使用 SynchronizedRef 保证并发安全
const ref = SynchronizedRef.makeUnsafe<State<A, E>>({ _tag: "Idle" })

// 使用 Effect.forkIn(scope) 创建受 Scope 管理的 Fiber
const fiber = yield* work.pipe(
  Effect.onExit((exit) => finishRun(id, done, exit)),
  Effect.forkIn(scope),
)
```

这个模式展示了：
- **SynchronizedRef** 保证状态转换的原子性
- **Deferred** 实现 Fiber 间的一次性信号传递
- **Fiber** 管理并发执行单元
- **Scope** 确保资源清理

---

## 七、总结

### 7.1 核心要点

1. **Fiber 是轻量级并发单元**：比 OS 线程轻量得多，可以创建数百万个
2. **结构化并发**：父 Fiber 管理子 Fiber 生命周期，中断时自动清理
3. **可取消**：Fiber 可以在任意点被安全地中断
4. **三种 fork 方式**：`forkChild`（结构化）、`forkScoped`（Scope 绑定）、`forkDetach`（脱离）
5. **Exit 类型**：统一表示成功、失败、中断三种完成状态

### 7.2 选择指南

| 场景 | 推荐方式 |
|------|---------|
| 需要父 Fiber 管理子 Fiber | `Effect.forkChild` |
| 需要 Scope 自动清理 | `Effect.forkScoped` |
| 需要脱离父 Fiber 独立运行 | `Effect.forkDetach` |
| 需要在指定 Scope 中运行 | `Effect.forkIn(scope)` |
| 管理多个 Fiber 集合 | `FiberSet` |
| 非阻塞检查 Fiber 状态 | `fiber.pollUnsafe()` |
| 安全获取 Fiber 结果 | `Fiber.await`（返回 Exit） |
| 传播 Fiber 错误 | `Fiber.join`（抛出错误） |

### 7.3 与后续章节的联系

- **第 12 章 Stream**：Stream 内部使用 Fiber 实现并发数据处理
- **第 13 章 Queue & Deferred**：Queue 和 Deferred 是 Fiber 间通信的核心原语
- **第 14 章 高级并发**：SynchronizedRef、Latch、FiberMap 等高级原语基于 Fiber 构建
- **第 19 章 OpenCode 实战**：runner.ts 中的 Fiber+Deferred+SynchronizedRef 状态机模式

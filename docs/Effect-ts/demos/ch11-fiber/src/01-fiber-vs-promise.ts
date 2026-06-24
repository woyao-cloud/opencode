/**
 * 01-fiber-vs-promise.ts — Fiber vs Promise: 创建时机、取消能力、结构化并发
 *
 * 对比 Fiber 和 Promise 的三个核心差异：
 * 1. 创建时机：Promise 创建即执行，Fiber 需要显式 fork
 * 2. 取消能力：Promise 不可取消，Fiber 可以中断
 * 3. 结构化并发：Fiber 支持父子生命周期管理
 */
import { Effect, Console, Fiber } from "effect"

// ============================================================================
// 1. 创建时机：Promise 创建即执行 vs Fiber 惰性执行
// ============================================================================

/** Promise 创建后立即开始执行 */
const promiseSideEffect = new Promise<string>((resolve) => {
  console.log("[Promise] 创建时立即执行！")
  setTimeout(() => resolve("Promise 结果"), 100)
})

/**
 * Effect 是惰性的 — 创建时什么都不做
 * 只有 fork 后才会开始执行
 */
const fiberEffect = Effect.gen(function* () {
  yield* Console.log("[Fiber] fork 后才开始执行！")
  yield* Effect.sleep("100 millis")
  return "Fiber 结果"
})

// ============================================================================
// 2. 取消能力：Fiber 可以中断，Promise 不可取消
// ============================================================================

/** 长时间运行的任务 */
const longRunningTask = Effect.gen(function* () {
  yield* Console.log("[任务] 开始执行...")
  yield* Effect.sleep("2 seconds")
  yield* Console.log("[任务] 执行完成")
  return "任务结果"
})

/** 可中断的 Fiber 版本 */
const interruptibleProgram = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景: Fiber 可中断 ===")
  const fiber = yield* Effect.forkChild(longRunningTask)

  // 1 秒后中断 Fiber
  yield* Effect.sleep("1 second")
  yield* Console.log("[主流程] 中断 Fiber...")
  yield* Fiber.interrupt(fiber)
  yield* Console.log("[主流程] Fiber 已中断")

  // 使用 await 获取 Exit（不传播错误）
  const exit = yield* Fiber.await(fiber)
  yield* Console.log("[主流程] Fiber 退出状态: " + exit._tag)
})

// ============================================================================
// 3. 结构化并发：Fiber 父子生命周期
// ============================================================================

/** 子任务 — 模拟后台工作 */
const childTask = (name: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep("500 millis")
    yield* Console.log("  [子任务 " + name + "] 完成")
    return "子任务 " + name + " 结果"
  })

/** 父任务 — 创建子 Fiber，父 Fiber 中断时子 Fiber 自动中断 */
const parentTask = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景: 结构化并发 ===")
  yield* Console.log("[父任务] 开始")

  // forkChild 创建子 Fiber，父 Fiber 中断时子 Fiber 也会被中断
  const fiber1 = yield* Effect.forkChild(childTask("A"))
  const fiber2 = yield* Effect.forkChild(childTask("B"))

  yield* Console.log("[父任务] 等待子任务...")
  const r1 = yield* Fiber.join(fiber1)
  const r2 = yield* Fiber.join(fiber2)
  yield* Console.log("[父任务] 结果: " + r1 + ", " + r2)
  yield* Console.log("[父任务] 完成")
})

// ============================================================================
// 4. forkDetach — 脱离父 Fiber 的独立 Fiber
// ============================================================================

const detachedProgram = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景: forkDetach 脱离父 Fiber ===")

  // forkDetach 创建的 Fiber 不受父 Fiber 生命周期影响
  const detached = yield* Effect.forkDetach(
    Effect.gen(function* () {
      yield* Effect.sleep("1 second")
      yield* Console.log("  [detached] 父 Fiber 已结束，但我还在运行！")
      return "detached"
    }),
  )

  yield* Console.log("[主流程] 父 Fiber 即将结束")
  // 父 Fiber 结束，但 detached Fiber 继续运行
})

// ============================================================================
// 运行所有场景
// ============================================================================

Effect.runPromise(
  Effect.gen(function* () {
    // 场景 1: 创建时机对比
    yield* Console.log("=== 场景 1: 创建时机对比 ===")
    yield* Console.log("[主流程] Promise 已创建，会立即执行")
    yield* Console.log("[主流程] Effect 已创建，但尚未执行")

    // fork 后 Effect 才开始执行
    const fiber = yield* Effect.forkChild(fiberEffect)
    // 使用 Effect.sync 获取已 resolved 的 Promise 值
    const promiseResult = yield* Effect.sync(function() { return "Promise 结果" })
    yield* Console.log("[主流程] Promise 结果: " + promiseResult)

    const fiberResult = yield* Fiber.join(fiber)
    yield* Console.log("[主流程] Fiber 结果: " + fiberResult)

    // 场景 2: 可中断
    yield* interruptibleProgram

    // 场景 3: 结构化并发
    yield* parentTask

    // 场景 4: forkDetach
    yield* detachedProgram

    // 等待 detached Fiber 完成
    yield* Effect.sleep("2 seconds")
  }),
)

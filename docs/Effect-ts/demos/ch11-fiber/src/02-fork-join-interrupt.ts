/**
 * 02-fork-join-interrupt.ts — fork / join / interrupt / interruptAs / await / poll
 *
 * Fiber 的核心操作：
 * - fork: 创建并发执行单元
 * - join: 等待 Fiber 完成并获取结果
 * - interrupt: 中断 Fiber 执行
 * - interruptAs: 使用指定 FiberId 中断
 * - await: 等待 Fiber 完成，返回 Exit（不传播错误）
 * - poll: 非阻塞检查 Fiber 是否完成
 */
import { Effect, Console, Fiber, Exit } from "effect"

// ============================================================================
// 1. fork + join — 创建并等待 Fiber
// ============================================================================

const forkJoinDemo = Effect.gen(function* () {
  yield* Console.log("=== 场景 1: fork + join ===")

  // forkChild 创建子 Fiber，在当前 Scope 中运行
  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("500 millis")
      yield* Console.log("  [Fiber] 任务完成")
      return 42
    }),
  )

  yield* Console.log("[主流程] Fiber 已创建，继续做其他工作...")
  yield* Effect.sleep("200 millis")
  yield* Console.log("[主流程] 现在等待 Fiber 结果")

  // join 等待 Fiber 完成并获取结果
  // 如果 Fiber 失败，join 会传播错误
  const result = yield* Fiber.join(fiber)
  yield* Console.log("[主流程] Fiber 结果: " + result)
})

// ============================================================================
// 2. await — 等待 Fiber 完成，返回 Exit（不传播错误）
// ============================================================================

const awaitDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 2: await 返回 Exit ===")

  const successFiber = yield* Effect.forkChild(Effect.succeed("成功"))
  const failFiber = yield* Effect.forkChild(Effect.fail("失败"))

  // await 返回 Exit，不会抛出错误
  const successExit = yield* Fiber.await(successFiber)
  const failExit = yield* Fiber.await(failFiber)

  yield* Console.log("[成功 Fiber] Exit: " + successExit._tag + ", 值: " + (Exit.isSuccess(successExit) ? successExit.value : "N/A"))
  yield* Console.log("[失败 Fiber] Exit: " + failExit._tag + ", 错误: " + (Exit.isFailure(failExit) ? String(failExit.cause) : "N/A"))
})

// ============================================================================
// 3. interrupt — 中断 Fiber
// ============================================================================

const interruptDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 3: interrupt ===")

  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Console.log("  [Fiber] 开始长时间任务...")
      yield* Effect.sleep("2 seconds")
      yield* Console.log("  [Fiber] 完成（这行不会执行）")
      return "完成"
    }),
  )

  yield* Effect.sleep("300 millis")
  yield* Console.log("[主流程] 中断 Fiber...")
  yield* Fiber.interrupt(fiber)

  // 中断后 await 返回 Exit
  const exit = yield* Fiber.await(fiber)
  yield* Console.log("[主流程] Fiber 退出状态: " + exit._tag)
  if (Exit.hasInterrupts(exit)) {
    yield* Console.log("[主流程] Fiber 被中断（InterruptedException）")
  }
})

// ============================================================================
// 4. interruptAs — 使用指定 FiberId 中断
// ============================================================================

const interruptAsDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 4: interruptAs ===")

  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("2 seconds")
      return "不会返回"
    }),
  )

  yield* Effect.sleep("200 millis")

  // interruptAs 使用指定的 FiberId 来中断
  // 这在调试时很有用 — 可以追踪是谁发起了中断
  const customFiberId = 999
  yield* Console.log("[主流程] 使用 FiberId " + customFiberId + " 中断...")
  yield* Fiber.interruptAs(fiber, customFiberId)

  const exit = yield* Fiber.await(fiber)
  yield* Console.log("[主流程] Fiber 被中断: " + Exit.hasInterrupts(exit))
})

// ============================================================================
// 5. poll — 非阻塞检查 Fiber 是否完成
// ============================================================================

const pollDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 5: poll 非阻塞检查 ===")

  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("1 second")
      return "最终结果"
    }),
  )

  // 立即 poll — Fiber 应该还没完成
  const earlyResult = fiber.pollUnsafe()
  yield* Console.log("[立即 poll] Fiber 已完成: " + (earlyResult !== undefined))

  // 等待 500ms 后再次 poll
  yield* Effect.sleep("500 millis")
  const midResult = fiber.pollUnsafe()
  yield* Console.log("[500ms 后 poll] Fiber 已完成: " + (midResult !== undefined))

  // 等待 Fiber 完成
  yield* Fiber.join(fiber)
  const finalResult = fiber.pollUnsafe()
  yield* Console.log("[完成后 poll] Fiber 已完成: " + (finalResult !== undefined))
  if (finalResult && Exit.isSuccess(finalResult)) {
    yield* Console.log("[完成后 poll] 结果: " + finalResult.value)
  }
})

// ============================================================================
// 6. 组合操作：多个 Fiber 的 joinAll / awaitAll / interruptAll
// ============================================================================

const batchDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 6: 批量 Fiber 操作 ===")

  const fibers = yield* Effect.all([
    Effect.forkChild(
      Effect.gen(function* () {
        yield* Effect.sleep("300 millis")
        return "快速任务"
      }),
    ),
    Effect.forkChild(
      Effect.gen(function* () {
        yield* Effect.sleep("600 millis")
        return "中速任务"
      }),
    ),
    Effect.forkChild(
      Effect.gen(function* () {
        yield* Effect.sleep("900 millis")
        return "慢速任务"
      }),
    ),
  ])

  // awaitAll 等待所有 Fiber 完成，返回 Exit 数组
  yield* Console.log("[主流程] 等待所有 Fiber 完成...")
  const exits = yield* Fiber.awaitAll(fibers)
  for (let i = 0; i < exits.length; i++) {
    const exit = exits[i]
    if (Exit.isSuccess(exit)) {
      yield* Console.log("[Fiber " + i + "] 成功: " + exit.value)
    }
  }
})

// ============================================================================
// 运行所有场景
// ============================================================================

Effect.runPromise(
  Effect.gen(function* () {
    yield* forkJoinDemo
    yield* awaitDemo
    yield* interruptDemo
    yield* interruptAsDemo
    yield* pollDemo
    yield* batchDemo
  }),
)

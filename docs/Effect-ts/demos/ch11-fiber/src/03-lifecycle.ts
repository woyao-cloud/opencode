/**
 * 03-lifecycle.ts — Fiber 生命周期：创建、运行、完成
 *
 * Fiber 的生命周期状态：
 * - Suspended（挂起）：Fiber 已创建但尚未开始执行
 * - Running（运行中）：Fiber 正在执行 Effect
 * - Done（完成）：Fiber 已完成执行（成功/失败/中断）
 *
 * 本章通过 pollUnsafe、await、addObserver 等 API 观察 Fiber 状态变化。
 */
import { Effect, Console, Fiber, Exit, FiberSet } from "effect"

// ============================================================================
// 1. 观察 Fiber 状态变化
// ============================================================================

const observeLifecycle = Effect.gen(function* () {
  yield* Console.log("=== 场景 1: 观察 Fiber 生命周期 ===")

  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Console.log("  [Fiber] 状态: Running（开始执行）")
      yield* Effect.sleep("500 millis")
      yield* Console.log("  [Fiber] 状态: Running（即将完成）")
      return "生命周期完成"
    }),
  )

  // 刚 fork 后 poll — Fiber 可能还在 Running
  yield* Console.log("[主流程] Fiber ID: " + fiber.id)
  let status = fiber.pollUnsafe()
  yield* Console.log("[主流程] 刚 fork 后 poll: " + (status === undefined ? "Running" : "Done"))

  // 等待 Fiber 完成
  const result = yield* Fiber.join(fiber)
  yield* Console.log("[主流程] Fiber 结果: " + result)

  // 完成后 poll — 应该返回 Exit
  status = fiber.pollUnsafe()
  yield* Console.log("[主流程] 完成后 poll: " + (status !== undefined ? "Done" : "Running"))
  if (status && Exit.isSuccess(status)) {
    yield* Console.log("[主流程] Exit 值: " + status.value)
  }
})

// ============================================================================
// 2. addObserver — 注册 Fiber 完成回调
// ============================================================================

const observerDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 2: addObserver 完成回调 ===")

  const fiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("300 millis")
      return 100
    }),
  )

  // 注册完成回调 — Fiber 完成时自动触发
  fiber.addObserver(function(exit) {
    if (Exit.isSuccess(exit)) {
      console.log("  [Observer] Fiber 成功完成，值: " + exit.value)
    } else {
      console.log("  [Observer] Fiber 失败: " + String(exit.cause))
    }
  })

  yield* Console.log("[主流程] Observer 已注册，等待 Fiber 完成...")
  const result = yield* Fiber.join(fiber)
  yield* Console.log("[主流程] join 结果: " + result)
})

// ============================================================================
// 3. Fiber 成功与失败路径
// ============================================================================

const successFailDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 3: 成功与失败路径 ===")

  // 成功 Fiber
  const successFiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("200 millis")
      return "成功值"
    }),
  )

  // 失败 Fiber
  const failFiber = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("100 millis")
      return yield* Effect.fail(new Error("出错了"))
    }),
  )

  // 使用 await 获取 Exit（不传播错误）
  const successExit = yield* Fiber.await(successFiber)
  const failExit = yield* Fiber.await(failFiber)

  yield* Console.log("[成功 Fiber] Exit._tag: " + successExit._tag)
  yield* Console.log("[失败 Fiber] Exit._tag: " + failExit._tag)

  // 使用 join 获取结果（失败 Fiber 会传播错误）
  const joinResult = yield* Fiber.join(successFiber)
  yield* Console.log("[成功 Fiber] join 结果: " + joinResult)

  // 失败 Fiber 的 join 会抛出错误
  const joinFailExit = yield* Fiber.await(failFiber)
  yield* Console.log("[失败 Fiber] join 结果: " + (Exit.isFailure(joinFailExit) ? "捕获错误" : "成功"))
})

// ============================================================================
// 4. FiberSet — 管理多个 Fiber 的生命周期
// ============================================================================

const fiberSetDemo = Effect.scoped(
  Effect.gen(function* () {
    yield* Console.log("")
    yield* Console.log("=== 场景 4: FiberSet 管理多个 Fiber ===")

    // FiberSet 是一个受 Scope 管理的 Fiber 集合
    // 当 Scope 关闭时，所有 Fiber 自动中断
    const fiberSet = yield* FiberSet.make()

  // 添加多个 Fiber 到集合
  const f1 = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("400 millis")
      yield* Console.log("  [FiberSet-1] 完成")
      return 1
    }),
  )
  yield* FiberSet.add(fiberSet, f1)

  const f2 = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("200 millis")
      yield* Console.log("  [FiberSet-2] 完成")
      return 2
    }),
  )
  yield* FiberSet.add(fiberSet, f2)

  const f3 = yield* Effect.forkChild(
    Effect.gen(function* () {
      yield* Effect.sleep("600 millis")
      yield* Console.log("  [FiberSet-3] 完成")
      return 3
    }),
  )
  yield* FiberSet.add(fiberSet, f3)

  // 等待所有 Fiber 完成
  yield* Console.log("[主流程] 等待 FiberSet 中所有 Fiber 完成...")
  yield* FiberSet.join(fiberSet)
  yield* Console.log("[主流程] FiberSet 中所有 Fiber 已完成")

  // 检查 FiberSet 大小
  const size = yield* FiberSet.size(fiberSet)
  yield* Console.log("[主流程] FiberSet 大小: " + size)
  }),
)

// ============================================================================
// 5. 使用 Fiber.awaitAll 等待多个 Fiber
// ============================================================================

const awaitAllDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 5: awaitAll 批量等待 ===")

  const fibers = yield* Effect.all([
    Effect.forkChild(
      Effect.gen(function* () {
        yield* Effect.sleep("300 millis")
        return "A"
      }),
    ),
    Effect.forkChild(
      Effect.gen(function* () {
        yield* Effect.sleep("100 millis")
        return "B"
      }),
    ),
    Effect.forkChild(
      Effect.gen(function* () {
        yield* Effect.sleep("500 millis")
        return "C"
      }),
    ),
  ])

  yield* Console.log("[主流程] 等待所有 Fiber...")
  const exits = yield* Fiber.awaitAll(fibers)
  for (const exit of exits) {
    if (Exit.isSuccess(exit)) {
      yield* Console.log("  Fiber 结果: " + exit.value)
    }
  }
})

// ============================================================================
// 运行所有场景
// ============================================================================

Effect.runPromise(
  Effect.gen(function* () {
    yield* observeLifecycle
    yield* observerDemo
    yield* successFailDemo
    yield* fiberSetDemo
    yield* awaitAllDemo
  }),
)

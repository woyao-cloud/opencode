/**
 * 03-deferred.ts — Deferred 延迟承诺：make / succeed / fail / await / poll
 *
 * Deferred 是一个一次性异步变量，可以被多个 Fiber 等待：
 * - make: 创建 Deferred
 * - succeed / fail / die / interrupt: 完成 Deferred
 * - await: 阻塞等待 Deferred 完成
 * - poll: 非阻塞检查是否完成
 * - isDone: 检查是否已设置
 * - complete / completeWith: 用 Effect 结果完成 Deferred
 *
 * 运行: bun run src/03-deferred.ts
 */
import { Effect, Deferred, Console, Fiber, Option, Exit } from "effect"

// ============================================================
// 1. make / succeed / await — 基本流程
// ============================================================

const demoBasic = Effect.gen(function* () {
  Console.log("=== 1. make / succeed / await — 基本流程 ===")

  // Deferred.make<A, E>() — 创建 Deferred
  const deferred = yield* Deferred.make<number>()

  // succeed: 设置值
  const success = yield* Deferred.succeed(deferred, 42)
  Console.log(`succeed(42): ${success}`)

  // await: 阻塞等待值
  const value = yield* Deferred.await(deferred)
  Console.log(`await: ${value}（预期 42）`)
})

// ============================================================
// 2. fail — 错误传播
// ============================================================

const demoFail = Effect.gen(function* () {
  Console.log("\n=== 2. fail — 错误传播 ===")

  const deferred = yield* Deferred.make<number, string>()

  // fail: 设置错误
  yield* Deferred.fail(deferred, "操作失败")

  // await 会传播错误
  const result = yield* Effect.exit(Deferred.await(deferred))
  const msg = Exit.match(result, {
    onSuccess: (v) => `成功: ${v}`,
    onFailure: (cause) => `失败: ${cause}`,
  })
  Console.log(`await 结果: ${msg}`)
})

// ============================================================
// 3. poll / isDone — 非阻塞状态查询
// ============================================================

const demoPoll = Effect.gen(function* () {
  Console.log("\n=== 3. poll / isDone — 状态查询 ===")

  const deferred = yield* Deferred.make<string>()

  // isDone: 检查是否已完成
  const done1 = yield* Deferred.isDone(deferred)
  Console.log(`设置前 isDone: ${done1}`)

  // poll: 非阻塞获取值
  const poll1 = yield* Deferred.poll(deferred)
  Console.log(`设置前 poll: ${Option.isNone(poll1) ? "None" : "Some(effect)"}`)

  yield* Deferred.succeed(deferred, "hello")

  const done2 = yield* Deferred.isDone(deferred)
  Console.log(`设置后 isDone: ${done2}`)

  const poll2 = yield* Deferred.poll(deferred)
  Console.log(`设置后 poll: ${Option.isSome(poll2) ? "Some(effect)" : "None"}`)

  const value = yield* Deferred.await(deferred)
  Console.log(`await: ${value}`)
})

// ============================================================
// 4. 单次赋值 — 多次 succeed 只有第一次生效
// ============================================================

const demoSingleAssignment = Effect.gen(function* () {
  Console.log("\n=== 4. 单次赋值 ===")

  const deferred = yield* Deferred.make<number>()

  // 第一次 succeed 成功
  const first = yield* Deferred.succeed(deferred, 100)
  Console.log(`第一次 succeed(100): ${first}`)

  // 第二次 succeed 返回 false
  const second = yield* Deferred.succeed(deferred, 200)
  Console.log(`第二次 succeed(200): ${second}（预期 false）`)

  const value = yield* Deferred.await(deferred)
  Console.log(`await: ${value}（预期 100 — 仍是第一次的值）`)
})

// ============================================================
// 5. Fiber 间通信 — 一个 Fiber 等待另一个 Fiber 设置值
// ============================================================

const demoFiberCommunication = Effect.gen(function* () {
  Console.log("\n=== 5. Fiber 间通信 ===")

  const deferred = yield* Deferred.make<string>()

  // 等待者 Fiber：等待 Deferred 完成
  const waiter = yield* Effect.forkDetach(
    Effect.gen(function* () {
      Console.log("[waiter] 开始等待...")
      const value = yield* Deferred.await(deferred)
      Console.log(`[waiter] 收到: ${value}`)
      return value
    }),
  )

  // 设置者 Fiber：延时后设置值
  const setter = yield* Effect.forkDetach(
    Effect.gen(function* () {
      yield* Effect.sleep("200 millis")
      Console.log("[setter] 设置值为 'Hello from Fiber'")
      yield* Deferred.succeed(deferred, "Hello from Fiber")
    }),
  )

  // 等待两个 Fiber 完成
  const result = yield* Fiber.join(waiter)
  yield* Fiber.join(setter)
  Console.log(`waiter 结果: ${result}`)
})

// ============================================================
// 6. complete / completeWith — 用 Effect 完成 Deferred
// ============================================================

const demoComplete = Effect.gen(function* () {
  Console.log("\n=== 6. complete / completeWith ===")

  const d1 = yield* Deferred.make<number, string>()

  // complete: 用 Effect 结果完成 Deferred
  const c1 = yield* Deferred.complete(d1, Effect.succeed(99))
  Console.log(`complete(succeed(99)): ${c1}`)
  Console.log(`await: ${yield* Deferred.await(d1)}`)

  const d2 = yield* Deferred.make<number, string>()

  // completeWith: 更快的版本（不记忆 Effect 结果）
  const c2 = yield* Deferred.completeWith(d2, Effect.succeed(88))
  Console.log(`completeWith(succeed(88)): ${c2}`)
  Console.log(`await: ${yield* Deferred.await(d2)}`)
})

// ============================================================
// 7. done / die / interrupt — 高级完成方式
// ============================================================

const demoAdvanced = Effect.gen(function* () {
  Console.log("\n=== 7. done / die / interrupt ===")

  // done: 用 Exit 完成
  const d1 = yield* Deferred.make<number>()
  yield* Deferred.done(d1, Exit.succeed(55))
  Console.log(`done(Exit.succeed(55)): ${yield* Deferred.await(d1)}`)

  // die: 用缺陷（defect）完成
  const d2 = yield* Deferred.make<number>()
  yield* Deferred.die(d2, new Error("致命错误"))
  const exit2 = yield* Effect.exit(Deferred.await(d2))
  Console.log(`die 后 await: ${Exit.isFailure(exit2) ? "失败（预期）" : "意外成功"}`)

  // interrupt: 中断 Deferred
  const d3 = yield* Deferred.make<number>()
  yield* Deferred.interrupt(d3)
  const exit3 = yield* Effect.exit(Deferred.await(d3))
  Console.log(`interrupt 后 await: ${Exit.isFailure(exit3) ? "已中断/失败（预期）" : "意外状态"}`)
})

// ============================================================
// 8. 多等待者 — 多个 Fiber 等待同一个 Deferred
// ============================================================

const demoMultipleWaiters = Effect.gen(function* () {
  Console.log("\n=== 8. 多等待者 — 多个 Fiber 等待同一个 Deferred ===")

  const deferred = yield* Deferred.make<number>()

  // 创建 3 个等待者
  const waiters = yield* Effect.all(
    Array.from({ length: 3 }, (_, i) =>
      Effect.forkDetach(
        Effect.gen(function* () {
          Console.log(`[waiter-${i}] 开始等待...`)
          const value = yield* Deferred.await(deferred)
          Console.log(`[waiter-${i}] 收到: ${value}`)
          return value
        }),
      ),
    ),
  )

  yield* Effect.sleep("100 millis")

  // 设置值 — 所有等待者同时收到
  Console.log("[setter] 设置值...")
  yield* Deferred.succeed(deferred, 777)

  // 等待所有等待者完成
  yield* Effect.all(waiters.map((f) => Fiber.join(f)))
  Console.log("所有等待者都已收到值")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoBasic
  yield* demoFail
  yield* demoPoll
  yield* demoSingleAssignment
  yield* demoFiberCommunication
  yield* demoComplete
  yield* demoAdvanced
  yield* demoMultipleWaiters
  Console.log("\n✅ 03-deferred.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

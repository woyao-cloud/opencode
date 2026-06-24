/**
 * 02-fiber-scheduling.ts — Fiber 调度：并发 Fork、公平性、大规模并发
 *
 * 性能分析要点：
 * - Fiber 是轻量级协程，fork 开销远小于 OS 线程
 * - Effect-TS 的调度器是公平的：每个 Fiber 轮流获得执行时间
 * - 大规模 fork 时注意 Scope 管理，避免 Fiber 泄漏
 * - 使用 Fiber.joinAll 等待所有 Fiber 完成
 *
 * 运行: bun run src/02-fiber-scheduling.ts
 */
import { Effect, Fiber, Console, Scope } from "effect"

// ============================================================
// 1. Fiber fork 开销 — 创建 vs OS 线程
// ============================================================

const demoSpawnOverhead = Effect.gen(function* () {
  Console.log("=== 1. Fiber fork 开销（1,000 个 Fiber）===")

  // fork 1,000 个轻量 Fiber
  const start = performance.now()
  const fibers: Array<Fiber.Runtime<unknown, number>> = []
  for (let i = 0; i < 1_000; i++) {
    const fiber = yield* Effect.fork(Effect.sync(() => i))
    fibers.push(fiber)
  }
  const forkTime = (performance.now() - start).toFixed(3)
  Console.log(`  fork 1,000 Fiber: ${forkTime}ms`)

  // join 所有 Fiber
  const joinStart = performance.now()
  const results = yield* Fiber.joinAll(fibers)
  const joinTime = (performance.now() - joinStart).toFixed(3)
  Console.log(`  join 1,000 Fiber: ${joinTime}ms`)
  Console.log(`  结果数量: ${results.length}`)
})

// ============================================================
// 2. 公平性 — Fiber 轮流执行
// ============================================================

const demoFairness = Effect.gen(function* () {
  Console.log("\n=== 2. Fiber 调度公平性（5 个 Fiber 各自计数）===")

  const sharedCounts = new Array(5).fill(0)
  const ITERATIONS = 10_000

  // 创建 5 个 Fiber，每个执行 ITERATIONS 次计数
  const countingFibers = yield* Effect.all(
    sharedCounts.map((_, idx) =>
      Effect.fork(
        Effect.gen(function* () {
          for (let i = 0; i < ITERATIONS; i++) {
            sharedCounts[idx]++
            // 每 100 次让出执行权，模拟公平调度
            if (i % 100 === 0) {
              yield* Effect.yieldNow()
            }
          }
        }),
      ),
    ),
  )

  // 等待所有 Fiber 完成
  yield* Fiber.joinAll(countingFibers)

  sharedCounts.forEach((count, idx) => {
    Console.log(`  Fiber ${idx}: ${count} 次（预期 ${ITERATIONS}）`)
  })
})

// ============================================================
// 3. 大规模 fork — 1,000 个并发 Fiber
// ============================================================

const demoLargeScaleFork = Effect.gen(function* () {
  Console.log("\n=== 3. 大规模并发 fork（1,000 个 Fiber，各 sleep 10ms）===")

  const FIBER_COUNT = 1_000

  // 创建 1,000 个 Fiber，每个 sleep 10ms
  const start = performance.now()
  const fibers = yield* Effect.all(
    Array.from({ length: FIBER_COUNT }, (_, i) =>
      Effect.fork(
        Effect.gen(function* () {
          yield* Effect.sleep("10 millis")
          return i
        }),
      ),
    ),
  )

  const forkTime = (performance.now() - start).toFixed(3)
  Console.log(`  fork ${FIBER_COUNT} Fiber: ${forkTime}ms`)

  // join 所有 Fiber
  const joinStart = performance.now()
  const results = yield* Fiber.joinAll(fibers)
  const joinTime = (performance.now() - joinStart).toFixed(3)
  Console.log(`  join ${FIBER_COUNT} Fiber: ${joinTime}ms`)
  Console.log(`  总时间（应接近 10ms，并发执行）: ${(performance.now() - start).toFixed(3)}ms`)
  Console.log(`  结果数量: ${results.length}`)
})

// ============================================================
// 4. Scope 管理 — 避免 Fiber 泄漏
// ============================================================

const demoScopeManagement = Effect.gen(function* () {
  Console.log("\n=== 4. Scope 管理 — 自动清理 vs 手动管理 ===")

  // 使用 Scope 自动管理 Fiber 生命周期
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      // 在 Scope 内 fork 的所有 Fiber 在 Scope 关闭时自动中断
      const fibers: Array<Fiber.Runtime<unknown, number>> = []
      for (let i = 0; i < 100; i++) {
        const fiber = yield* Effect.fork(
          Effect.gen(function* () {
            yield* Effect.sleep("50 millis")
            return i * 2
          }),
        )
        fibers.push(fiber)
      }

      // 等待所有完成
      const results = yield* Fiber.joinAll(fibers)
      Console.log(`  Scope 内 fork 100 Fiber，全部完成: ${results.length} 个`)
      return results.length
    }),
  )

  Console.log(`  Scope 关闭后，所有 Fiber 自动清理`)
  Console.log(`  最终结果: ${result}`)
})

// ============================================================
// 5. forkDaemon vs fork — 守护 Fiber 不阻塞退出
// ============================================================

const demoDaemonFiber = Effect.gen(function* () {
  Console.log("\n=== 5. forkDaemon — 守护 Fiber（不阻塞 Scope 关闭）===")

  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      // forkDaemon: Scope 关闭时不等待该 Fiber
      yield* Effect.forkDaemon(
        Effect.gen(function* () {
          yield* Effect.sleep("100 millis")
          Console.log("  守护 Fiber 可能不会执行到这里（Scope 先关闭）")
        }),
      )

      // 正常 fork: Scope 关闭时等待
      const fiber = yield* Effect.fork(Effect.succeed("正常 Fiber 结果"))

      const value = yield* Fiber.join(fiber)
      Console.log(`  正常 Fiber 结果: ${value}`)
      return value
    }),
  )

  Console.log(`  Scope 关闭后守护 Fiber 被中断`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoSpawnOverhead
  yield* demoFairness
  yield* demoLargeScaleFork
  yield* demoScopeManagement
  yield* demoDaemonFiber
  Console.log("\n✅ 02-fiber-scheduling.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

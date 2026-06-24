/**
 * 02-latch.ts — Latch：一次性并发门闩
 *
 * Latch 是一个并发控制原语，用于协调多个 Fiber 的启动/停止时机。
 * 它类似于一个"门"：可以在 open/closed 之间切换，多个 Fiber
 * 可以 await 等待门打开。
 *
 * 核心操作：make / open / close / await / release / whenOpen
 *
 * 运行: bun run src/02-latch.ts
 */
import { Effect, Latch, Fiber, Console, Option } from "effect"

// ============================================================
// 1. make + open + await — 基础用法
// ============================================================

const demoBasic = Effect.gen(function* () {
  Console.log("=== 1. make / open / await — 基础门闩 ===")

  // Latch.make(open?) — 创建门闩，默认关闭
  const latch = yield* Latch.make(false)

  // 启动一个等待者 Fiber
  const waiter = yield* Effect.forkDetach(
    Effect.gen(function* () {
      Console.log("  [waiter] 等待门打开...")
      yield* Latch.await(latch)
      Console.log("  [waiter] 门已打开，继续执行！")
    }),
  )

  // 模拟一些工作
  yield* Effect.sleep("200 millis")
  Console.log("  [main] 打开门闩...")

  // open — 打开门闩，释放所有等待者
  const opened = yield* Latch.open(latch)
  Console.log(`  [main] 门闩已打开: ${opened}`)

  yield* Fiber.join(waiter)
})

// ============================================================
// 2. 多个等待者 — 广播释放
// ============================================================

const demoMultiWait = Effect.gen(function* () {
  Console.log("\n=== 2. 多个等待者 — 广播释放 ===")

  const latch = yield* Latch.make(false)

  // 创建 5 个等待者
  const waiters = yield* Effect.all(
    Array.from({ length: 5 }, (_, i) =>
      Effect.forkDetach(
        Effect.gen(function* () {
          Console.log(`  [worker-${i}] 等待...`)
          yield* Latch.await(latch)
          Console.log(`  [worker-${i}] 收到信号，开始工作！`)
        }),
      ),
    ),
  )

  yield* Effect.sleep("300 millis")
  Console.log("  [main] 打开门闩，释放所有 worker...")
  yield* Latch.open(latch)

  // 等待所有 worker 完成
  yield* Effect.all(waiters.map((f) => Fiber.join(f)))
  Console.log("  [main] 所有 worker 完成")
})

// ============================================================
// 3. close / open 循环 — 可重复使用
// ============================================================

const demoCycle = Effect.gen(function* () {
  Console.log("\n=== 3. close / open 循环 ===")

  // 初始状态为打开
  const latch = yield* Latch.make(true)
  Console.log("  门闩初始状态: 打开")

  // 等待已打开的门 — 立即返回
  yield* Latch.await(latch)
  Console.log("  等待已打开的门: 立即通过")

  // close — 关闭门闩
  yield* Latch.close(latch)
  Console.log("  门闩已关闭")

  // 尝试等待关闭的门 — 会被阻塞
  const waiter = yield* Effect.forkDetach(
    Effect.gen(function* () {
      Console.log("  [waiter] 等待关闭的门...")
      yield* Latch.await(latch)
      Console.log("  [waiter] 门又打开了！")
    }),
  )

  yield* Effect.sleep("200 millis")

  // 重新打开
  yield* Latch.open(latch)
  Console.log("  门闩重新打开")

  yield* Fiber.join(waiter)
})

// ============================================================
// 4. release — 释放等待者但不改变状态
// ============================================================

const demoRelease = Effect.gen(function* () {
  Console.log("\n=== 4. release — 释放等待者但保持关闭 ===")

  const latch = yield* Latch.make(false)

  const waiter = yield* Effect.forkDetach(
    Effect.gen(function* () {
      Console.log("  [waiter] 等待中...")
      yield* Latch.await(latch)
      Console.log("  [waiter] 被 release 释放！")
    }),
  )

  yield* Effect.sleep("200 millis")

  // release — 释放所有等待的 Fiber，但门保持关闭状态
  yield* Latch.release(latch)
  Console.log("  [main] release 执行完毕")

  yield* Fiber.join(waiter)
  Console.log("  [main] waiter 已释放，但门仍处于之前状态")
})

// ============================================================
// 5. whenOpen — 仅在门打开时执行 Effect
// ============================================================

const demoWhenOpen = Effect.gen(function* () {
  Console.log("\n=== 5. whenOpen — 条件执行 ===")

  const latch = yield* Latch.make(false)

  // whenOpen — 仅在门打开时才执行传入的 Effect
  const action = Latch.whenOpen(
    latch,
    Effect.gen(function* () {
      Console.log("  [action] 我被执行了！（因为门已打开）")
      return "done"
    }),
  )

  // 门关闭时，action 会阻塞
  const waiter = yield* Effect.forkDetach(action)

  yield* Effect.sleep("200 millis")
  Console.log("  [main] 打开门闩...")
  yield* Latch.open(latch)

  const result = yield* Fiber.join(waiter)
  Console.log(`  [main] whenOpen 结果: ${result}`)
})

// ============================================================
// 6. 实战: 优雅关闭模式
// ============================================================

const demoGracefulShutdown = Effect.gen(function* () {
  Console.log("\n=== 6. 实战: 优雅关闭模式 ===")

  // 创建关闭信号
  const shutdownLatch = yield* Latch.make(false)

  // 模拟后台服务
  const server = yield* Effect.forkDetach(
    Effect.gen(function* () {
      let tick = 0
      // 循环直到门打开
      while (true) {
        tick++
        Console.log(`  [server] tick ${tick}`)
        // 竞速: 等待 50ms 或等待门打开
        const result = yield* Latch.await(shutdownLatch).pipe(
          Effect.timeoutOption("50 millis"),
        )
        // 如果返回 Some，说明 await 在 timeout 前完成（门已打开）
        if (Option.isSome(result)) {
          break
        }
      }
      Console.log("  [server] 检测到关闭信号，正在清理...")
    }),
  )

  // 运行一段时间后发送关闭信号
  yield* Effect.sleep("250 millis")
  Console.log("  [main] 发送关闭信号...")
  yield* Latch.open(shutdownLatch)

  yield* Fiber.join(server)
  Console.log("  [main] 服务已优雅关闭")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoBasic
  yield* demoMultiWait
  yield* demoCycle
  yield* demoRelease
  yield* demoWhenOpen
  yield* demoGracefulShutdown
  Console.log("\n✅ 02-latch.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

/**
 * 03-fiber-leak.ts — Fiber 泄漏检测与预防
 *
 * 内存管理要点：
 * - forkDaemon 创建的 Fiber 不会阻止 Scope 关闭，但如果不中断可能泄漏
 * - 未 join 的 Fiber 如果持续运行会泄漏内存
 * - 使用 Effect.scoped 自动管理 Fiber 生命周期
 * - forkScoped 创建的 Fiber 在 Scope 关闭时自动中断
 * - WeakRef 可用于检测 Fiber 是否被正确回收
 *
 * 运行: bun run src/03-fiber-leak.ts
 */
import { Effect, Console, Scope, Fiber, Duration } from "effect"

// ============================================================
// 工具：追踪 Fiber 创建/销毁
// ============================================================

let activeFibers = 0

const trackFiberStart = Effect.sync(() => {
  activeFibers++
})

const trackFiberEnd = Effect.sync(() => {
  activeFibers--
})

const reportActive = (label: string) =>
  Effect.sync(() => Console.log(`  ${label}: 活跃 Fiber = ${activeFibers}`))

// ============================================================
// 1. forkDaemon 泄漏场景 — 没有 Scope 管理
// ============================================================

/**
 * forkDaemon 创建的 Fiber 独立于当前 Scope。
 * 如果不手动管理，可能导致 Fiber 持续运行占用内存。
 */
const demoDaemonLeak = Effect.gen(function* () {
  Console.log("=== 1. forkDaemon 泄漏场景 ===")
  activeFibers = 0

  // 创建一个 daemon Fiber，它持续运行
  const leakyFiber = yield* Effect.forkDaemon(
    Effect.gen(function* () {
      yield* trackFiberStart
      // 模拟持续运行的后台任务（不合理的长时间任务）
      let count = 0
      while (count < 3) {
        yield* Effect.sleep("5 millis")
        count++
      }
      yield* trackFiberEnd
    }),
  )

  // daemon Fiber 独立运行，不受当前上下文影响
  yield* reportActive("daemon Fiber 创建后")

  // 等待 daemon 完成（演示用，实际场景中 daemon 可能永不停止）
  yield* Fiber.join(leakyFiber)

  yield* reportActive("daemon Fiber 完成后")
  Console.log("  说明: forkDaemon 脱离 Scope 管理，需要手动 join/interrupt")
})

// ============================================================
// 2. 使用 Scope 防止泄漏 — forkScoped
// ============================================================

/**
 * forkScoped 将 Fiber 绑定到当前 Scope。
 * Scope 关闭时，Fiber 自动被中断。
 */
const demoForkScoped = Effect.gen(function* () {
  Console.log("\n=== 2. 使用 Scope 防止泄漏 ===")
  activeFibers = 0

  yield* Effect.scoped(
    Effect.gen(function* () {
      // forkScoped 创建的 Fiber 受 Scope 管理
      const fiber = yield* Effect.forkScoped(
        Effect.gen(function* () {
          yield* trackFiberStart
          // 模拟长时间运行的任务
          yield* Effect.sleep("50 millis")
          yield* trackFiberEnd
        }),
      )

      yield* reportActive("forkScoped Fiber 创建后（Scope 内）")

      // Scope 关闭时会自动中断 fiber（如果还未完成）
      Console.log("  Scope 即将关闭，Fiber 会被自动中断...")
    }),
  )

  // 给中断一点时间
  yield* Effect.sleep("10 millis")
  yield* reportActive("Scope 关闭后")
  Console.log("  说明: forkScoped 确保 Fiber 在 Scope 关闭时被中断")
})

// ============================================================
// 3. 未 join 的 Fiber 泄漏
// ============================================================

/**
 * 使用 Effect.fork 创建 Fiber 但不 join，可能导致泄漏。
 * 正确做法是 join 或使用 Scope 管理。
 */
const demoUnjoinedFiber = Effect.gen(function* () {
  Console.log("\n=== 3. 未 join 的 Fiber 泄漏 ===")
  activeFibers = 0

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 错误做法：fork 但不 join，也不使用 forkScoped
      // 注意：在 scoped 内使用 fork，Fiber 仍可能被中断
      // 但如果是顶层 fork 且没有 Scope，就会泄漏

      // 正确做法：使用 forkScoped
      yield* Effect.forkScoped(
        Effect.gen(function* () {
          yield* trackFiberStart
          yield* Effect.sleep("5 millis")
          yield* trackFiberEnd
        }),
      )

      yield* reportActive("forkScoped 内")
    }),
  )

  yield* Effect.sleep("10 millis")
  yield* reportActive("Scope 关闭后")

  Console.log("  说明: 始终使用 forkScoped 或将 Fiber 绑定到 Scope")
})

// ============================================================
// 4. Fiber 中断与资源清理
// ============================================================

/**
 * Fiber 被中断时，其内部 Scope 的 finalizer 仍会执行。
 * 这保证了资源不会因中断而泄漏。
 */
const demoFiberInterruptCleanup = Effect.gen(function* () {
  Console.log("\n=== 4. Fiber 中断时的资源清理 ===")

  yield* Effect.scoped(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkScoped(
        Effect.gen(function* () {
          // 在 Fiber 内部注册 finalizer
          yield* Effect.addFinalizer((_exit) =>
            Effect.sync(() =>
              Console.log("  [finalizer] Fiber 被中断，清理资源"),
            ),
          )

          // 长时间运行的任务
          Console.log("  Fiber 开始长时间任务...")
          yield* Effect.sleep("100 millis")
          Console.log("  这行不会执行（Fiber 被中断）")
        }),
      )

      yield* Effect.sleep("5 millis")

      // 主动中断 Fiber
      Console.log("  中断 Fiber...")
      yield* Fiber.interrupt(fiber)

      Console.log("  Fiber 已中断，finalizer 已执行")
    }),
  )

  Console.log("  说明: Fiber 中断时内部 finalizer 仍会执行，不会泄漏资源")
})

// ============================================================
// 5. WeakRef 验证 Fiber 回收
// ============================================================

/**
 * 使用 WeakRef 验证对象是否被 GC 回收。
 * 注意：GC 时机不确定，此测试仅作演示。
 */
const demoWeakRefCheck = Effect.gen(function* () {
  Console.log("\n=== 5. WeakRef 验证对象回收 ===")

  // 创建一个对象并使用 WeakRef 跟踪
  let ref: WeakRef<object> | null = null

  yield* Effect.scoped(
    Effect.gen(function* () {
      const obj = { data: new Array(1000).fill("x") }
      ref = new WeakRef(obj)

      Console.log("  WeakRef 已创建，跟踪对象...")

      // 注册 finalizer 清理引用
      yield* Effect.addFinalizer((_exit) =>
        Effect.sync(() => Console.log("  Scope 关闭，obj 超出作用域")),
      )
    }),
  )

  // obj 已超出作用域，强制 GC（不保证立即回收）
  // 在 Bun 中可以使用 Bun.gc(true) 强制 GC
  if (typeof globalThis !== "undefined" && "Bun" in globalThis) {
    const g = globalThis as any
    if (typeof g.Bun?.gc === "function") {
      g.Bun.gc(true)
    }
  }

  // 检查 WeakRef
  const derefResult = ref?.deref()
  Console.log(
    `  WeakRef.deref() 结果: ${derefResult ? "对象仍存活" : "对象已被回收"}`,
  )
  Console.log(
    "  说明: Scope 关闭后，内部对象不再被引用，可以被 GC 回收",
  )
})

// ============================================================
// 6. 泄漏预防最佳实践总结
// ============================================================

const demoBestPractices = Effect.gen(function* () {
  Console.log("\n=== 6. 泄漏预防最佳实践 ===")
  Console.log("  1. 始终使用 forkScoped 而非 forkDaemon（除非确有必要）")
  Console.log("  2. 使用 Effect.scoped 包裹所有资源获取代码")
  Console.log("  3. fork 后务必 join 或 interrupt")
  Console.log("  4. 在 Fiber 内部使用 addFinalizer 注册清理逻辑")
  Console.log("  5. 使用 Scope.fork 隔离不同生命周期的资源")
  Console.log("  6. 对于长时间运行的后台任务，使用 forkDaemon + 手动管理")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoDaemonLeak
  yield* demoForkScoped
  yield* demoUnjoinedFiber
  yield* demoFiberInterruptCleanup
  yield* demoWeakRefCheck
  yield* demoBestPractices
  Console.log("\n✅ 03-fiber-leak.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

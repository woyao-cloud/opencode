/**
 * 02-scope-release.ts — Scope 释放时机与 finalizer 顺序
 *
 * 内存管理要点：
 * - acquireRelease 的 LIFO 释放顺序保证后获取的资源先释放
 * - addFinalizer 在 Scope 关闭时执行，即使 Effect 失败也会执行
 * - Scope.fork 创建子作用域，子作用域独立管理资源
 * - 子作用域中的资源在子作用域关闭时释放，不影响父作用域
 * - 使用 Scope.make() 手动控制 Scope 生命周期
 *
 * 运行: bun run src/02-scope-release.ts
 */
import { Effect, Console, Scope, Exit } from "effect"

// ============================================================
// 1. acquireRelease LIFO 释放顺序
// ============================================================

let releaseLog: Array<string> = []

/** 模拟资源：数据库连接 */
const makeConnection = (name: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      Console.log(`  [acquire] 获取连接 ${name}`)
      return { name }
    }),
    (conn, _exit) =>
      Effect.sync(() => {
        releaseLog.push(`release:${conn.name}`)
        Console.log(`  [release] 释放连接 ${conn.name}`)
      }),
  )

const demoLifoRelease = Effect.gen(function* () {
  Console.log("=== 1. acquireRelease LIFO 释放顺序 ===")
  releaseLog = []

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 获取顺序: A → B → C
      const connA = yield* makeConnection("A")
      const connB = yield* makeConnection("B")
      const connC = yield* makeConnection("C")

      Console.log(`  使用连接: ${connA.name}, ${connB.name}, ${connC.name}`)
      // Scope 关闭时释放顺序: C → B → A（LIFO）
    }),
  )

  Console.log(`  释放顺序: ${releaseLog.join(" → ")}`)
  Console.log("  说明: acquireRelease 按 LIFO 顺序释放，后获取的先释放")
})

// ============================================================
// 2. addFinalizer 与 acquireRelease 混合顺序
// ============================================================

const demoFinalizerOrder = Effect.gen(function* () {
  Console.log("\n=== 2. addFinalizer 与 acquireRelease 混合顺序 ===")
  releaseLog = []

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 注册 finalizer（最先注册，最后执行）
      yield* Effect.addFinalizer((_exit) =>
        Effect.sync(() => {
          releaseLog.push("finalizer:metrics")
          Console.log("  [finalizer] 记录指标")
        }),
      )

      // 获取资源 A（中间注册，中间执行）
      yield* makeConnection("A")

      // 注册 finalizer（最后注册，最先执行）
      yield* Effect.addFinalizer((_exit) =>
        Effect.sync(() => {
          releaseLog.push("finalizer:cleanup")
          Console.log("  [finalizer] 清理临时数据")
        }),
      )

      Console.log("  Scope 即将关闭...")
    }),
  )

  Console.log(`  执行顺序: ${releaseLog.join(" → ")}`)
  Console.log("  说明: 所有 finalizer 和 release 统一按 LIFO 顺序执行")
})

// ============================================================
// 3. 错误场景中的释放 — finalizer 确保执行
// ============================================================

const demoErrorRelease = Effect.gen(function* () {
  Console.log("\n=== 3. 错误场景中的释放 ===")
  releaseLog = []

  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      // 注册清理钩子 — 即使发生错误也会执行
      yield* Effect.addFinalizer((exit) =>
        Effect.sync(() => {
          const status = Exit.isSuccess(exit) ? "成功" : "失败"
          releaseLog.push(`cleanup(${status})`)
          Console.log(`  [finalizer] 清理（退出状态: ${status}）`)
        }),
      )

      // 获取资源
      yield* makeConnection("critical")

      // 模拟错误
      Console.log("  [error] 操作失败！")
      yield* Effect.fail(new Error("操作异常"))

      // 这行不会执行
      Console.log("  不会到达这里")
    }),
  ).pipe(
    Effect.match({
      onFailure: (err) => `捕获错误: ${err.message}`,
      onSuccess: (v) => `成功: ${v}`,
    }),
  )

  Console.log(`  ${result}`)
  Console.log(`  释放记录: ${releaseLog.join(" → ")}`)
  Console.log("  说明: 即使 Effect 失败，finalizer 仍会执行")
})

// ============================================================
// 4. Scope.fork 子作用域 — 内存隔离
// ============================================================

/**
 * Scope.fork 创建子作用域，子作用域的资源独立于父作用域。
 * 父作用域关闭时，子作用域不一定关闭。
 */
const demoScopeFork = Effect.gen(function* () {
  Console.log("\n=== 4. Scope.fork 子作用域内存隔离 ===")
  releaseLog = []

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 在父作用域中获取资源
      yield* makeConnection("parent")

      // 创建子作用域
      const childScope = yield* Scope.fork

      // 在子作用域中获取资源（使用 ExtendScope）
      yield* makeConnection("child-A").pipe(
        Effect.provideService(Scope.Scope, childScope),
      )

      yield* makeConnection("child-B").pipe(
        Effect.provideService(Scope.Scope, childScope),
      )

      Console.log("  父作用域关闭前，手动关闭子作用域...")
      yield* Scope.close(childScope, Exit.succeed(undefined))
      Console.log(`  子作用域释放顺序: ${releaseLog.splice(0).join(" → ")}`)

      // 父作用域关闭时会释放 parent 连接
    }),
  )

  Console.log(`  父作用域释放顺序: ${releaseLog.join(" → ")}`)
  Console.log("  说明: 子作用域独立管理资源，可独立关闭而不影响父作用域")
})

// ============================================================
// 5. 手动 Scope 管理 — Scope.make()
// ============================================================

const demoManualScope = Effect.gen(function* () {
  Console.log("\n=== 5. 手动 Scope 管理 ===")
  releaseLog = []

  // 创建手动 Scope
  const scope = yield* Scope.make

  // 在手动 Scope 中获取资源
  yield* makeConnection("manual-A").pipe(
    Effect.provideService(Scope.Scope, scope),
  )
  yield* makeConnection("manual-B").pipe(
    Effect.provideService(Scope.Scope, scope),
  )

  Console.log("  资源已获取，Scope 尚未关闭")

  // 手动关闭 Scope
  yield* Scope.close(scope, Exit.succeed(undefined))
  Console.log(`  释放顺序: ${releaseLog.join(" → ")}`)

  Console.log("  说明: Scope.make() 允许精确控制释放时机")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoLifoRelease
  yield* demoFinalizerOrder
  yield* demoErrorRelease
  yield* demoScopeFork
  yield* demoManualScope
  Console.log("\n✅ 02-scope-release.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

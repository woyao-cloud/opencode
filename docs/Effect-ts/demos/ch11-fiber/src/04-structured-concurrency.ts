/**
 * 04-structured-concurrency.ts — 结构化并发：forkIn(scope) / Scope 自动清理
 *
 * 结构化并发的核心原则：
 * 1. Fiber 的生命周期不能超过其创建者的生命周期
 * 2. 父 Fiber 中断时，子 Fiber 自动中断
 * 3. 资源清理是确定性的
 *
 * 参考 OpenCode runner.ts 中的 Fiber+Deferred+SynchronizedRef 状态机模式。
 */
import { Effect, Console, Fiber, Scope, Exit, Deferred, SynchronizedRef } from "effect"

// ============================================================================
// 1. forkIn(scope) — 在指定 Scope 中创建 Fiber
// ============================================================================

const forkInDemo = Effect.gen(function* () {
  yield* Console.log("=== 场景 1: forkIn(scope) ===")

  // 手动创建 Scope
  const scope = yield* Scope.make()

  // 在 Scope 中 fork Fiber — Scope 关闭时 Fiber 自动中断
  const fiber = yield* Effect.forkIn(scope)(
    Effect.gen(function* () {
      yield* Console.log("  [Fiber] 在 Scope 中开始执行")
      yield* Effect.sleep("2 seconds")
      yield* Console.log("  [Fiber] 完成（如果 Scope 不关闭的话）")
      return "scope fiber"
    }),
  )

  yield* Console.log("[主流程] Fiber 已在 Scope 中创建")

  // 立即关闭 Scope — Fiber 会被自动中断
  yield* Effect.sleep("300 millis")
  yield* Console.log("[主流程] 关闭 Scope...")
  yield* Scope.close(scope, Exit.void)

  const exit = yield* Fiber.await(fiber)
  yield* Console.log("[主流程] Fiber 退出状态: " + exit._tag)
  yield* Console.log("[主流程] Fiber 被中断: " + Exit.hasInterrupts(exit))
})

// ============================================================================
// 2. forkScoped — 自动绑定到当前 Scope
// ============================================================================

const forkScopedDemo = Effect.scoped(
  Effect.gen(function* () {
    yield* Console.log("")
    yield* Console.log("=== 场景 2: forkScoped 自动绑定 Scope ===")

    // forkScoped 自动将 Fiber 绑定到当前 Scope
    // 当 Effect.scoped 创建的 Scope 关闭时，Fiber 自动中断
    const fiber = yield* Effect.forkScoped(
      Effect.gen(function* () {
        yield* Console.log("  [forkScoped] 开始执行")
        yield* Effect.sleep("3 seconds")
        yield* Console.log("  [forkScoped] 完成")
        return "scoped"
      }),
    )

    yield* Console.log("[主流程] forkScoped Fiber 已创建")
    yield* Effect.sleep("500 millis")
    yield* Console.log("[主流程] 即将退出 scoped 块，Scope 关闭时会自动中断 Fiber")
  }),
)

// ============================================================================
// 3. 简化版任务管理器 — 参考 OpenCode runner.ts 模式
// ============================================================================

/**
 * 任务状态 — 参考 OpenCode runner.ts 的 State 类型
 */
type TaskState<A, E> =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Running"; readonly fiber: Fiber.Fiber<A, E>; readonly done: Deferred.Deferred<A, E> }

/**
 * 简化版任务管理器
 * - 使用 Ref 和 Deferred 实现并发安全
 * - 使用 Fiber 管理并发执行
 *
 * 参考 OpenCode runner.ts 中的 Fiber+Deferred+SynchronizedRef 状态机模式。
 */
class TaskManager<A, E> {
  private state: TaskState<A, E> = { _tag: "Idle" }

  static make<A, E>(): Effect.Effect<TaskManager<A, E>> {
    return Effect.sync(function() { return new TaskManager<A, E>() })
  }

  /** 启动任务，如果已有运行中的任务则返回其结果 */
  start(work: Effect.Effect<A, E>): Effect.Effect<A, E> {
    if (this.state._tag === "Running") {
      return Deferred.await(this.state.done)
    }
    return Effect.gen(function* () {
      const done = yield* Deferred.make<A, E>()
      const fiber = yield* Effect.forkChild(
        work.pipe(
          Effect.onExit(function(exit) {
            return Deferred.done(done, exit)
          }),
        ),
      )
      this.state = { _tag: "Running", fiber, done }
      return yield* Deferred.await(done)
    })
  }

  /** 取消当前运行中的任务 */
  cancel(): Effect.Effect<void> {
    const current = this.state
    if (current._tag === "Running") {
      this.state = { _tag: "Idle" }
      return Fiber.interrupt(current.fiber)
    }
    return Effect.void
  }

  /** 检查是否空闲 */
  get isIdle(): Effect.Effect<boolean> {
    const self = this
    return Effect.sync(function() { return self.state._tag === "Idle" })
  }
}

// ============================================================================
// 4. 使用任务管理器
// ============================================================================

const taskManagerDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 3: 任务管理器（参考 OpenCode runner.ts 模式）===")

  const manager = yield* TaskManager.make<string>()

  // 启动第一个任务
  yield* Console.log("[主流程] 启动任务 1...")
  const result1 = yield* Effect.forkChild(
    manager.start(
      Effect.gen(function* () {
        yield* Effect.sleep("500 millis")
        yield* Console.log("  [任务 1] 完成")
        return "任务 1 结果"
      }),
    ),
  )

  // 启动第二个任务（此时第一个任务正在运行）
  yield* Console.log("[主流程] 启动任务 2（应等待任务 1 完成）...")
  const result2 = yield* Effect.forkChild(
    manager.start(
      Effect.gen(function* () {
        yield* Effect.sleep("300 millis")
        yield* Console.log("  [任务 2] 完成")
        return "任务 2 结果"
      }),
    ),
  )

  // 等待两个结果
  const r1 = yield* Fiber.join(result1)
  yield* Console.log("[主流程] 结果 1: " + r1)
  const r2 = yield* Fiber.join(result2)
  yield* Console.log("[主流程] 结果 2: " + r2)

  // 检查是否空闲
  const idle = yield* manager.isIdle
  yield* Console.log("[主流程] 管理器空闲: " + idle)
})

// ============================================================================
// 5. 取消任务管理器中的任务
// ============================================================================

const cancelDemo = Effect.gen(function* () {
  yield* Console.log("")
  yield* Console.log("=== 场景 4: 取消任务 ===")

  // 使用 forkIn(scope) 创建可取消的任务
  const scope = yield* Scope.make()
  const fiber = yield* Effect.forkIn(scope)(
    Effect.gen(function* () {
      yield* Console.log("  [任务] 开始长时间运行...")
      yield* Effect.sleep("5 seconds")
      yield* Console.log("  [任务] 完成")
      return "长时间任务结果"
    }),
  )

  yield* Effect.sleep("300 millis")
  yield* Console.log("[主流程] 关闭 Scope 取消任务...")
  yield* Scope.close(scope, Exit.void)

  const exit = yield* Fiber.await(fiber)
  yield* Console.log("[主流程] 任务退出状态: " + exit._tag)
  yield* Console.log("[主流程] 任务被中断: " + Exit.hasInterrupts(exit))
})

// ============================================================================
// 运行所有场景
// ============================================================================

Effect.runPromise(
  Effect.gen(function* () {
    yield* forkInDemo
    yield* forkScopedDemo
    yield* taskManagerDemo
    yield* cancelDemo
  }),
)

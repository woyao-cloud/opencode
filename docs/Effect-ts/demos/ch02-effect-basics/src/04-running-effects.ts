/**
 * 04-running-effects.ts — 运行 Effect
 *
 * 学习目标: 掌握 Effect 的四种运行方式（runSync/runPromise/runFork/runPromiseExit），
 *          理解每种方式的适用场景和限制条件
 * 前置章节: 03-generator-syntax.ts
 * 运行方式: bun run src/04-running-effects.ts
 */

import { Effect } from "effect"

// ============================================================
// 准备: 定义几个用于演示的 Effect
// ============================================================

// 纯同步 Effect（R=never, E=never）
const syncProgram = Effect.gen(function* () {
  const a = yield* Effect.succeed(10)
  const b = yield* Effect.succeed(20)
  return a + b
})

// 可能失败的同步 Effect（R=never, E=Error）
const riskyProgram = Effect.gen(function* () {
  const value = yield* Effect.try({
    try: () => {
      const n = Math.random()
      if (n > 0.5) throw new Error(`随机失败: n=${n.toFixed(2)}`)
      return n
    },
    catch: (err) => err as Error,
  })
  return `成功: ${value.toFixed(2)}`
})

// 异步 Effect（R=never, E=Error）
const asyncProgram = Effect.gen(function* () {
  console.log("  开始异步操作...")
  // 模拟异步延迟
  yield* Effect.tryPromise(() =>
    new Promise<string>((resolve) =>
      setTimeout(() => resolve("异步数据"), 500)
    )
  )
  return "异步操作完成"
})

// ============================================================
// 1. Effect.runSync — 同步运行
// ============================================================
// 要求: R=never（不需要依赖），E=never（不会失败）
// 如果 Effect 可能失败，runSync 会直接抛出异常
// 适合: 纯计算、测试、脚本

console.log("--- 1. Effect.runSync ---")
const syncResult = Effect.runSync(syncProgram)
console.log("runSync 结果:", syncResult)

// 尝试对可能失败的 Effect 使用 runSync
console.log("\n尝试 runSync 一个可能失败的 Effect:")
try {
  Effect.runSync(riskyProgram)
  console.log("  运气好，这次成功了")
} catch (err) {
  console.log("  捕获到异常:", (err as Error).message)
}

// ============================================================
// 2. Effect.runPromise — 返回 Promise
// ============================================================
// 要求: R=never（不需要依赖）
// 返回: Promise<A>
// 行为: Effect 成功 → Promise resolve，Effect 失败 → Promise reject
// 适合: 需要与现有 Promise 代码互操作、在 async 函数中使用

console.log("\n--- 2. Effect.runPromise ---")

Effect.runPromise(syncProgram)
  .then((result) => console.log("runPromise 同步程序:", result))

Effect.runPromise(riskyProgram)
  .then((result) => console.log("runPromise 成功:", result))
  .catch((err) => console.log("runPromise 失败 (Promise reject):", (err as Error).message))

// 异步程序
Effect.runPromise(asyncProgram)
  .then((result) => console.log("runPromise 异步程序:", result))

// ============================================================
// 3. Effect.runFork — 返回 Fiber（异步不阻塞）
// ============================================================
// 要求: R=never（不需要依赖）
// 返回: Fiber<A, E>
// 行为: 立即返回 Fiber，Effect 在后台执行
// 适合: 需要并发执行多个 Effect、需要取消能力

console.log("\n--- 3. Effect.runFork ---")

const fiber = Effect.runFork(
  Effect.gen(function* () {
    console.log("  Fiber 开始执行...")
    yield* Effect.tryPromise(() =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log("  Fiber 执行完成")
          resolve()
        }, 300)
      )
    )
    return "Fiber 结果"
  })
)

console.log("runFork 立即返回，不阻塞主线程")
console.log("Fiber 对象:", fiber.constructor.name)

// 等待 Fiber 完成以获取结果
Effect.runPromise(Effect.tryPromise(() =>
  new Promise<string>((resolve) =>
    setTimeout(() => resolve("主线程继续执行"), 100)
  )
)).then((msg) => console.log(msg))

// 等待 Fiber 完成
Effect.runPromise(fiber.await).then((result) =>
  console.log("Fiber 最终结果:", result)
)

// ============================================================
// 4. Effect.runPromiseExit — 返回 Exit（不抛异常）
// ============================================================
// 要求: R=never（不需要依赖）
// 返回: Promise<Exit<A, E>>
// 行为: 无论成功还是失败，都包装在 Exit 对象中，永不抛出
// 适合: 需要精确处理成功/失败两种情况的场景

console.log("\n--- 4. Effect.runPromiseExit ---")

// 成功场景
Effect.runPromiseExit(syncProgram).then((exit) =>
  console.log("runPromiseExit 成功:", exit.toString())
)

// 失败场景 — 不会抛出异常！
Effect.runPromiseExit(riskyProgram).then((exit) =>
  console.log("runPromiseExit 失败 (不抛异常):", exit.toString())
)

// 使用 Exit.match 分别处理成功和失败
Effect.runPromiseExit(riskyProgram).then((exit) => {
  const message = Effect.runSync(Effect.succeed(
    // Exit.match 安全地解构 Exit
    exit._tag === "Success"
      ? `成功! 值: ${exit.value}`
      : `失败! 错误: ${(exit.cause as any).failure?.message ?? exit.cause.toString()}`
  ))
  console.log("Exit.match 处理:", message)
})

// ============================================================
// 5. 运行方式总结
// ============================================================
console.log("\n--- 5. 运行方式总结 ---")
console.log("┌────────────────────┬───────────┬──────────────┬──────────────────────────┐")
console.log("│ 运行方式           │ 返回类型  │ 错误处理     │ 适用场景                 │")
console.log("├────────────────────┼───────────┼──────────────┼──────────────────────────┤")
console.log("│ runSync            │ A         │ 直接抛出     │ 纯同步、脚本、测试       │")
console.log("│ runPromise         │ Promise<A>│ Promise reject│ 与 Promise 互操作       │")
console.log("│ runFork            │ Fiber     │ Fiber.await  │ 并发、可取消             │")
console.log("│ runPromiseExit     │ Exit<A,E> │ 永不抛出     │ 精确错误处理             │")
console.log("└────────────────────┴───────────┴──────────────┴──────────────────────────┘")

console.log("\n关键理解:")
console.log("  - runSync 最简单，但要求 Effect 不能失败（E=never）")
console.log("  - runPromise 最常用，将 Effect 世界连接到 Promise 世界")
console.log("  - runFork 不阻塞，适合启动后台任务")
console.log("  - runPromiseExit 最安全，永远不会抛出异常")
console.log("  - 所有运行方式都要求 R=never（后续章节会讲如何提供依赖）")

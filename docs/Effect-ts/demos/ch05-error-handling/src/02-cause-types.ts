/**
 * 02-cause-types.ts — Cause 类型体系
 *
 * 演示 Effect-TS 的 Cause 错误原因类型体系：
 * - Cause.Fail: 预期的业务错误
 * - Cause.Die: 非预期的缺陷（bug / 未捕获异常）
 * - Cause.Interrupt: Fiber 被中断
 * - Cause.Sequential: 顺序错误组合
 * - Cause.Parallel: 并发错误组合
 * - Cause.pretty: 格式化错误信息
 *
 * 参考 OpenCode 中 promise.ts 的 Cause 处理模式。
 *
 * 运行: bun run src/02-cause-types.ts
 */

import { Effect, Cause, Fiber } from "effect"

// ============================================================
// 1. Cause.Fail — 预期的业务错误
// ============================================================

console.log("=== 1. Cause.Fail — 预期的业务错误 ===\n")

const failEffect = Effect.fail(new Error("数据库连接超时"))

const program1 = Effect.gen(function* () {
  // 使用 Effect.cause 捕获完整的 Cause 对象
  const cause = yield* Effect.fail(new Error("数据库连接超时")).pipe(
    Effect.cause,
  )
  return cause
})

Effect.runPromise(program1).then((cause) => {
  console.log("Cause 类型:", cause._tag)  // "Fail"
  console.log("错误信息:", Cause.pretty(cause))
})

// Cause.Fail 包含可恢复的错误
const failCause = Cause.fail(new Error("业务错误"))
console.log("\nCause.Fail:")
console.log("  _tag:", failCause._tag)
console.log("  error:", failCause.error.message)

// ============================================================
// 2. Cause.Die — 非预期的缺陷
// ============================================================

console.log("\n=== 2. Cause.Die — 非预期的缺陷 ===\n")

// Die 表示程序中的 bug 或未预期的异常，不应该被常规错误处理捕获
const dieEffect = Effect.die(new Error("内部状态不一致 — 这是一个 bug"))

const program2 = Effect.gen(function* () {
  const cause = yield* dieEffect.pipe(Effect.cause)
  return cause
})

Effect.runPromise(program2).then((cause) => {
  console.log("Cause 类型:", cause._tag)  // "Die"
  console.log("缺陷信息:", Cause.pretty(cause))
})

// Die 和 Fail 的关键区别:
// - Fail: 可恢复的预期错误 (catchTag / catchAll 可捕获)
// - Die: 不可恢复的缺陷 (catchTag / catchAll 不可捕获)

// 演示: catchAll 无法捕获 Die
const program2b = Effect.gen(function* () {
  return yield* Effect.die(new Error("致命缺陷")).pipe(
    Effect.catchAll((_err) => Effect.succeed("已恢复")),
  )
})

Effect.runPromise(program2b).then(
  (result) => console.log("结果:", result),
  (cause) => console.log("catchAll 无法捕获 Die:", Cause.pretty(cause)),
)

// ============================================================
// 3. Cause.Interrupt — Fiber 被中断
// ============================================================

console.log("\n=== 3. Cause.Interrupt — Fiber 中断 ===\n")

// 当 Fiber 被中断时，错误类型是 Interrupt
// 这发生在 Fiber.interrupt 调用或 Scope 关闭时

const program3 = Effect.gen(function* () {
  // 启动一个长时间运行的 Fiber
  const fiber = yield* Effect.sleep("3 seconds").pipe(
    Effect.fork,
  )

  // 立即中断它
  yield* Fiber.interrupt(fiber)

  // 等待 Fiber 完成（会得到 Interrupt 的 Cause）
  const exit = yield* Fiber.await(fiber)
  console.log("Fiber 退出状态:", exit._tag)  // "Failure"

  // 从 Exit 中提取 Cause
  const cause = Cause.failureOption(exit)
  if (Cause.isInterruptedOnly(cause)) {
    console.log("✅ 确认为中断: 错误原因是 Interrupt")
  }
  console.log("Cause 详情:", Cause.pretty(cause))
})

Effect.runPromise(program3)

// 创建纯 Interrupt Cause 演示
const interruptCause = Cause.interrupt(Fiber.id(undefined as any))
console.log("\nCause.Interrupt:")
console.log("  _tag:", interruptCause._tag)
console.log("  isInterrupted:", Cause.isInterrupted(interruptCause))

// ============================================================
// 4. Cause.Sequential — 顺序错误组合
// ============================================================

console.log("\n=== 4. Cause.Sequential — 顺序错误组合 ===\n")

// 当 Effect.gen 中有多个操作，第一个失败后立即停止
// 如果多个操作都失败（通过某些方式），它们的错误会组合

const program4 = Effect.gen(function* () {
  // 第一个操作失败，第二个不会执行
  const result = yield* Effect.fail(new Error("第一步失败")).pipe(
    Effect.zipRight(Effect.fail(new Error("第二步也失败"))),
    Effect.cause,
  )
  return result
})

Effect.runPromise(program4).then((cause) => {
  // Sequential 只在有多个错误时出现
  // 对于单个错误，直接是 Fail
  console.log("单错误 Cause:", cause._tag)
  console.log("详情:", Cause.pretty(cause))
})

// 创建 Sequential Cause 示例
const seqCause = Cause.sequential(
  Cause.fail(new Error("第一步失败")),
  Cause.fail(new Error("第二步失败")),
)
console.log("\nCause.Sequential:")
console.log("  _tag:", seqCause._tag)
console.log("  详情:", Cause.pretty(seqCause))

// ============================================================
// 5. Cause.Parallel — 并发错误组合
// ============================================================

console.log("\n=== 5. Cause.Parallel — 并发错误组合 ===\n")

// 当多个并发操作都失败时，错误组合为 Parallel
const program5 = Effect.gen(function* () {
  const cause = yield* Effect.all(
    [
      Effect.fail(new Error("并发操作 A 失败")),
      Effect.fail(new Error("并发操作 B 失败")),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.cause,
  )
  return cause
})

Effect.runPromise(program5).then((cause) => {
  console.log("Cause 类型:", cause._tag)  // "Parallel"
  console.log("并发错误详情:")
  console.log(Cause.pretty(cause))
})

// ============================================================
// 6. Cause.pretty — 格式化错误信息
// ============================================================

console.log("\n=== 6. Cause.pretty — 格式化错误 ===\n")

// Cause.pretty 是调试错误的最佳工具
const complexCause = Cause.parallel(
  Cause.sequential(
    Cause.fail(new Error("校验失败: 邮箱格式不正确")),
    Cause.fail(new Error("校验失败: 密码太短")),
  ),
  Cause.fail(new Error("网络超时")),
)

console.log("格式化输出:")
console.log(Cause.pretty(complexCause))

// ============================================================
// 7. OpenCode 参考 — Cause 生产级用法
// ============================================================

console.log("\n=== 7. OpenCode 模式参考 ===\n")

// 参考 packages/opencode/src/effect/promise.ts:
//
//   Effect.tryPromise(evaluate).pipe(
//     Effect.catch((error) => {
//       const cause = Cause.isUnknownError(error) ? error.cause : error
//       const refined = refine(cause)
//       if (refined !== undefined) return Effect.fail(refined)
//       return Effect.die(cause)
//     }),
//   )
//
// 核心模式:
//   1. Cause.isUnknownError 判断是否为未知错误
//   2. 提取原始 cause 进行细化分类
//   3. 可识别的错误 → Effect.fail（预期错误）
//   4. 不可识别的错误 → Effect.die（缺陷/未知错误）

// 模拟 OpenCode 的错误分类模式
const classifyError = (raw: unknown): Effect.Effect<string, Error> => {
  if (raw instanceof Error) {
    if (raw.message.includes("超时")) {
      return Effect.fail(new Error("业务错误: 操作超时"))
    }
    return Effect.fail(new Error(`业务错误: ${raw.message}`))
  }
  // 无法识别的错误 → Die
  return Effect.die(new Error(`未知错误类型: ${String(raw)}`))
}

const program7 = Effect.gen(function* () {
  // 已知错误 → Fail
  const result1 = yield* classifyError(new Error("连接超时，请重试")).pipe(
    Effect.cause,
  )
  console.log("已知错误 Cause:", result1._tag, "|", Cause.pretty(result1))

  // 未知错误 → Die
  const result2 = yield* classifyError("神秘错误").pipe(
    Effect.cause,
  )
  console.log("\n未知错误 Cause:", result2._tag, "|", Cause.pretty(result2))
})

Effect.runPromise(program7)

console.log("\n✅ 02-cause-types.ts 运行完成")

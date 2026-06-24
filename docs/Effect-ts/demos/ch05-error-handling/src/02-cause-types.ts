/**
 * 02-cause-types.ts — Cause 类型体系
 *
 * 演示 Effect-TS 的 Cause 错误原因类型体系：
 * - Cause.Fail: 预期的业务错误（通过 Cause.findFail 提取）
 * - Cause.Die: 非预期的缺陷（bug / 未捕获异常）
 * - Cause.Interrupt: Fiber 被中断
 * - Cause.combine: 多个错误组合（替代 Sequential/Parallel）
 * - Cause.pretty: 格式化错误信息
 *
 * beta.65 API 注意:
 *   - Cause 对象的 reasons 数组包含 Fail/Die/Interrupt reason
 *   - 使用 Cause.hasFails / hasDies / hasInterrupts 判断类型
 *   - Cause.findFail / findDie 返回 Result 类型，用 .success 取值
 *   - Cause.combine 替代 Cause.sequential / Cause.parallel
 *   - Effect.exit 替代 Effect.either 和 Effect.cause
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

const program1 = Effect.gen(function* () {
  // 使用 Effect.exit 捕获完整的 Exit 对象
  const exit = yield* Effect.fail(new Error("数据库连接超时")).pipe(
    Effect.exit,
  )
  return exit
})

Effect.runPromise(program1).then((exit) => {
  if (exit._tag === "Failure") {
    const cause = exit.cause
    console.log("hasFails:", Cause.hasFails(cause))
    console.log("错误信息:", Cause.pretty(cause))

    // 提取 Fail reason: findFail 返回 Result 类型
    const failResult = Cause.findFail(cause)
    if (failResult._tag === "Success") {
      const failReason = (failResult as any).success
      console.log("Fail reason._tag:", failReason._tag)
      console.log("Fail error:", failReason.error.message)
    }
  }
})

// Cause.Fail 包含可恢复的错误
const failCause = Cause.fail(new Error("业务错误"))
console.log("\nCause.Fail:")
console.log("  hasFails:", Cause.hasFails(failCause))
console.log("  pretty:", Cause.pretty(failCause).split("\n")[0])

// ============================================================
// 2. Cause.Die — 非预期的缺陷
// ============================================================

console.log("\n=== 2. Cause.Die — 非预期的缺陷 ===\n")

// Die 表示程序中的 bug 或未预期的异常，不应该被常规错误处理捕获
const program2 = Effect.gen(function* () {
  const exit = yield* Effect.die(new Error("内部状态不一致 — 这是一个 bug")).pipe(
    Effect.exit,
  )
  return exit
})

Effect.runPromise(program2).then((exit) => {
  if (exit._tag === "Failure") {
    const cause = exit.cause
    console.log("hasDies:", Cause.hasDies(cause))
    console.log("hasFails:", Cause.hasFails(cause))
    console.log("缺陷信息:", Cause.pretty(cause))

    // 提取 Die reason
    const dieResult = Cause.findDie(cause)
    if (dieResult._tag === "Success") {
      const dieReason = (dieResult as any).success
      console.log("Die reason._tag:", dieReason._tag)
      console.log("Die defect:", dieReason.defect.message)
    }
  }
})

// Die 和 Fail 的关键区别:
// - Fail: 可恢复的预期错误 (catchTag / catch 可捕获)
// - Die: 不可恢复的缺陷 (catchTag / catch 不可捕获)

// 演示: catch 无法捕获 Die
const program2b = Effect.die(new Error("致命缺陷")).pipe(
  Effect.catch((_err) => Effect.succeed("已恢复")),
)

Effect.runPromise(program2b).then(
  (result) => console.log("\n捕获 Die 的结果:", result),
  (cause) => {
    // catch 无法捕获 Die，所以这里收到的是原始 Die Cause
    // 注意: runPromise reject 时传入的不一定是 Cause 对象
    console.log("\ncatch 无法捕获 Die — 错误向上传播")
  },
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

  // 等待 Fiber 完成
  const exit = yield* Fiber.await(fiber)
  console.log("Fiber 退出状态:", exit._tag)  // "Failure"

  if (exit._tag === "Failure") {
    const cause = exit.cause
    if (Cause.hasInterruptsOnly(cause)) {
      console.log("✅ 确认为中断: 错误原因是 Interrupt")
    }
    console.log("Cause 详情:", Cause.pretty(cause).slice(0, 200))
  }
})

Effect.runPromise(program3)

// 创建纯 Interrupt Cause 演示
const interruptCause = Cause.interrupt("test-fiber-id")
console.log("\nCause.Interrupt:")
console.log("  hasInterrupts:", Cause.hasInterrupts(interruptCause))
console.log("  hasInterruptsOnly:", Cause.hasInterruptsOnly(interruptCause))
console.log("  pretty:", Cause.pretty(interruptCause).slice(0, 100))

// ============================================================
// 4. Cause.combine — 多个错误组合
// ============================================================

console.log("\n=== 4. Cause.combine — 多个错误组合 ===\n")

// beta.65 使用 Cause.combine 组合多个错误（替代 Sequential/Parallel）
// 可以多次调用 combine 来组合任意数量的错误

const combinedCause = Cause.combine(
  Cause.combine(
    Cause.fail(new Error("第一步失败: 校验邮箱格式")),
    Cause.fail(new Error("第二步失败: 密码太短")),
  ),
  Cause.fail(new Error("第三步失败: 网络超时")),
)

console.log("组合后的 Cause:")
console.log("  reasons 数量:", combinedCause.reasons?.length)
console.log("  hasFails:", Cause.hasFails(combinedCause))
console.log("  详情:")
console.log(Cause.pretty(combinedCause))

// Cause.combine 也可以混合 Fail 和 Die
const mixedCause = Cause.combine(
  Cause.fail(new Error("业务错误")),
  Cause.die(new Error("未预期缺陷")),
)
console.log("\n混合 Cause:")
console.log("  hasFails:", Cause.hasFails(mixedCause))
console.log("  hasDies:", Cause.hasDies(mixedCause))
console.log(Cause.pretty(mixedCause))

// ============================================================
// 5. Effect.catchCause — 用 Cause 信息做决策
// ============================================================

console.log("\n=== 5. Effect.catchCause — 用 Cause 信息做决策 ===\n")

// catchCause 让你访问完整的 Cause 对象，做出更细粒度的决策
const program5 = Effect.gen(function* () {
  const result = yield* Effect.fail(new Error("暂时性错误")).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasFails(cause)) {
        const failResult = Cause.findFail(cause)
        if (failResult._tag === "Success") {
          const failReason = (failResult as any).success
          if (failReason.error.message.includes("暂时性")) {
            return Effect.succeed("暂时性错误已恢复")
          }
        }
      }
      return Effect.fail(new Error("非暂时性错误，无法恢复"))
    }),
  )
  return result
})

Effect.runPromise(program5).then((result) =>
  console.log("catchCause 结果:", result),
)

// ============================================================
// 6. Cause.pretty — 格式化错误信息
// ============================================================

console.log("\n=== 6. Cause.pretty — 格式化错误 ===\n")

// Cause.pretty 是调试错误的最佳工具
const complexCause = Cause.combine(
  Cause.combine(
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
  const exit1 = yield* classifyError(new Error("连接超时，请重试")).pipe(Effect.exit)
  if (exit1._tag === "Failure") {
    console.log("已知错误 — hasFails:", Cause.hasFails(exit1.cause))
    console.log("  pretty:", Cause.pretty(exit1.cause).split("\n")[0])
  }

  // 未知错误 → Die
  const exit2 = yield* classifyError("神秘错误").pipe(Effect.exit)
  if (exit2._tag === "Failure") {
    console.log("\n未知错误 — hasDies:", Cause.hasDies(exit2.cause))
    console.log("  pretty:", Cause.pretty(exit2.cause).split("\n")[0])
  }
})

Effect.runPromise(program7)

console.log("\n✅ 02-cause-types.ts 运行完成")

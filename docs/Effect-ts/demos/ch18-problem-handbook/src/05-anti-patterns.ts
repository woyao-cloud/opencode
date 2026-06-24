/**
 * 05-anti-patterns.ts — 5 个常见反模式及正确写法
 *
 * 演示 Effect-TS 开发中常见的 5 个反模式及其正确实现：
 * - 反模式 1: 在 Effect.gen 中使用 try/catch
 * - 反模式 2: 使用 Effect.run* 获取值后再处理
 * - 反模式 3: 忽略错误类型
 * - 反模式 4: 嵌套 Effect.gen
 * - 反模式 5: 忘记处理 Fiber 生命周期
 *
 * 运行: bun run src/05-anti-patterns.ts
 */

import { Effect, Console, Duration, Fiber, Schedule } from "effect"

// ============================================================
// 反模式 1: 在 Effect.gen 中使用 try/catch
// ============================================================

console.log("=== 反模式 1: 在 Effect.gen 中使用 try/catch ===\n")

// ❌ 错误: 在 Effect.gen 中使用 try/catch 捕获 Effect 错误
const antiPattern1 = Effect.gen(function* () {
  try {
    const result = yield* Effect.fail(new Error("业务错误"))
    return result
  } catch (e) {
    // 这里的 catch 不会捕获 Effect.fail！
    // Effect.fail 不是 throw，不会触发 try/catch
    console.log("  这里永远不会执行到")
    return "降级值"
  }
})

Effect.runPromise(antiPattern1).then(
  (result) => console.log("反模式 1 结果（不应该成功）:", result),
  (err) => console.log("反模式 1 失败（错误未被捕获）:", err.message),
)

// ✅ 正确: 使用 Effect.catch 或 catchTag
const pattern1 = Effect.gen(function* () {
  const result = yield* Effect.fail(new Error("业务错误"))
  return result
}).pipe(
  Effect.catch((err) => {
    console.log("  ✅ catchAll 正确捕获:", err.message)
    return Effect.succeed("降级值")
  }),
)

Effect.runPromise(pattern1).then((result) =>
  console.log("正确模式 1 结果:", result),
)

// ============================================================
// 反模式 2: 使用 Effect.run* 获取值后再处理
// ============================================================

console.log("\n=== 反模式 2: 使用 Effect.run* 获取值后再处理 ===\n")

// ❌ 错误: 先 runSync 获取值，再在外部处理
const antiPattern2 = (): void => {
  const effect = Effect.succeed(42).pipe(
    Effect.map((n) => n * 2),
  )
  // 过早地运行 Effect，失去了组合能力
  const value = Effect.runSync(effect)
  console.log(`  反模式 2 结果: ${value + 10}`)
}
antiPattern2()

// ✅ 正确: 在 Effect 内部完成所有处理
const pattern2 = Effect.succeed(42).pipe(
  Effect.map((n) => n * 2),
  Effect.map((n) => n + 10),
  Effect.tap((n) => Console.log(`  ✅ 正确模式 2 结果: ${n}`)),
)

Effect.runPromise(pattern2)

// ============================================================
// 反模式 3: 忽略错误类型
// ============================================================

console.log("\n=== 反模式 3: 忽略错误类型 ===\n")

// ❌ 错误: 使用 catchAll 捕获所有错误，丢失类型信息
class ValidationError extends Error {
  readonly _tag = "ValidationError"
  constructor(readonly field: string, message: string) {
    super(message)
    this.name = "ValidationError"
  }
}

class AuthError extends Error {
  readonly _tag = "AuthError"
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

const processData = (data: string): Effect.Effect<string, ValidationError | AuthError> =>
  Effect.gen(function* () {
    if (data === "") {
      return yield* Effect.fail(new ValidationError("name", "名称不能为空"))
    }
    if (data === "admin") {
      return yield* Effect.fail(new AuthError("无权限"))
    }
    return `已处理: ${data}`
  })

// ❌ 错误: 使用 catchAll 丢失了错误类型区分
const antiPattern3 = processData("").pipe(
  Effect.catch((err) => {
    // err 是 ValidationError | AuthError，需要手动判断
    if (err instanceof ValidationError) {
      return Effect.succeed(`字段 ${err.field} 校验失败`)
    }
    return Effect.succeed("未知错误")
  }),
)

// ✅ 正确: 使用 catchTag 按类型精确处理
const pattern3 = processData("").pipe(
  Effect.catchTag("ValidationError", (err: ValidationError) =>
    Effect.succeed(`✅ 字段 ${err.field} 校验失败: ${err.message}`),
  ),
  Effect.catchTag("AuthError", (err: AuthError) =>
    Effect.succeed(`✅ 权限错误: ${err.message}`),
  ),
)

Effect.runPromise(antiPattern3).then((r) => console.log("反模式 3:", r))
Effect.runPromise(pattern3).then((r) => console.log("正确模式 3:", r))

// ============================================================
// 反模式 4: 嵌套 Effect.gen
// ============================================================

console.log("\n=== 反模式 4: 嵌套 Effect.gen ===\n")

// ❌ 错误: 深层嵌套 Effect.gen，难以阅读和维护
const antiPattern4 = Effect.gen(function* () {
  const a = yield* Effect.gen(function* () {
    const b = yield* Effect.gen(function* () {
      const c = yield* Effect.succeed(1)
      return c + 1
    })
    return b * 2
  })
  return a + 3
})

// ✅ 正确: 使用 pipe + map/flatMap 扁平化
const pattern4 = Effect.succeed(1).pipe(
  Effect.map((c) => c + 1),
  Effect.map((b) => b * 2),
  Effect.map((a) => a + 3),
  Effect.tap((r) => Console.log(`  ✅ 正确模式 4 结果: ${r}`)),
)

Effect.runPromise(antiPattern4).then((r) => console.log("反模式 4 结果:", r))
Effect.runPromise(pattern4)

// ============================================================
// 反模式 5: 忘记处理 Fiber 生命周期
// ============================================================

console.log("\n=== 反模式 5: 忘记处理 Fiber 生命周期 ===\n")

// ❌ 错误: fork 后忘记 join/interrupt，Fiber 变成"遗忘"状态
const antiPattern5 = Effect.gen(function* () {
  // fork 了一个 Fiber 但没有保存引用
  yield* Effect.gen(function* () {
    yield* Console.log("  反模式 5: 这个 Fiber 被遗忘了")
    yield* Effect.sleep(Duration.seconds(10))
    return "永远不会被消费"
  }).pipe(Effect.forkChild)

  // 主流程继续，但后台 Fiber 无法被管理
  return "主流程完成"
})

Effect.runPromise(antiPattern5).then((r) => console.log("反模式 5:", r))

// ✅ 正确: 使用 Scope 管理 Fiber 生命周期
const pattern5 = Effect.scoped(
  Effect.gen(function* () {
    // 使用 forkScoped 将 Fiber 绑定到 Scope
    // 当 Scope 关闭时，所有绑定的 Fiber 自动中断
    const fiber = yield* Effect.gen(function* () {
      yield* Console.log("  ✅ 正确模式 5: Fiber 在 Scope 中运行")
      yield* Effect.sleep(Duration.seconds(10))
      return "Fiber 结果"
    }).pipe(Effect.forkScoped)

    // 主流程
    yield* Console.log("  ✅ 主流程执行中...")
    yield* Effect.sleep(Duration.millis(100))

    // 在 Scope 关闭前 join Fiber 获取结果
    const result = yield* Fiber.join(fiber)
    return result
  }),
)

Effect.runPromise(pattern5).then(
  (r) => console.log("正确模式 5:", r),
  (err) => console.log("正确模式 5 错误:", err.message),
)

// 或者使用 forkScoped 自动绑定到 Scope
const pattern5b = Effect.scoped(
  Effect.gen(function* () {
    const fiber = yield* Effect.gen(function* () {
      yield* Console.log("  ✅ 正确模式 5b: forkScoped 自动管理")
      yield* Effect.sleep(Duration.seconds(10))
      return "Fiber 结果"
    }).pipe(Effect.forkScoped)

    yield* Console.log("  ✅ 主流程执行中...")
    yield* Effect.sleep(Duration.millis(100))

    const result = yield* Fiber.join(fiber)
    return result
  }),
)

Effect.runPromise(pattern5b).then(
  (r) => console.log("正确模式 5b:", r),
  (err) => console.log("正确模式 5b 错误:", err.message),
)

console.log("\n✅ 05-anti-patterns.ts 运行完成")

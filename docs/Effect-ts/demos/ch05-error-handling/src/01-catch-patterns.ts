/**
 * 01-catch-patterns.ts — catchTag / catch / catchIf
 *
 * 演示 Effect-TS 的三种错误捕获模式：
 * - Effect.catchTag: 按错误 _tag 精确捕获
 * - Effect.catch: 捕获所有错误（beta.65 中 catchAll 已不存在）
 * - Effect.catchIf: 选择性捕获部分错误（beta.65 中 catchSome 已不存在）
 *
 * 注意: beta.65 的 API:
 *   - Effect.catchTag（单数）按 _tag 匹配
 *   - Effect.catch 捕获所有错误
 *   - Effect.catchIf(predicate, handler) 选择性捕获
 * 错误类型使用 Schema.Class + 显式 _tag 字段（TaggedErrorClass 在 Bun 下有兼容问题）。
 *
 * 运行: bun run src/01-catch-patterns.ts
 */

import { Effect, Schema } from "effect"

// ============================================================
// 1. 定义带 _tag 的错误类型（Schema.Class + 显式 _tag）
// ============================================================

// 网络错误
class NetworkError extends Schema.Class<NetworkError>("NetworkError")({
  _tag: Schema.Literal("NetworkError"),
  message: Schema.String,
  statusCode: Schema.Number,
}) {
  get description(): string {
    return `[网络错误 ${this.statusCode}] ${this.message}`
  }
}

// 校验错误
class ValidationError extends Schema.Class<ValidationError>("ValidationError")({
  _tag: Schema.Literal("ValidationError"),
  message: Schema.String,
  field: Schema.String,
}) {
  get description(): string {
    return `[校验错误] ${this.field}: ${this.message}`
  }
}

// 权限错误
class AuthError extends Schema.Class<AuthError>("AuthError")({
  _tag: Schema.Literal("AuthError"),
  message: Schema.String,
}) {
  get description(): string {
    return `[权限错误] ${this.message}`
  }
}

// ============================================================
// 2. 模拟会失败的业务函数
// ============================================================

// 模拟获取用户数据 — 可能因网络或权限失败
const fetchUser = (id: number): Effect.Effect<string, NetworkError | AuthError> =>
  Effect.gen(function* () {
    if (id <= 0) {
      return yield* Effect.fail(new NetworkError({
        _tag: "NetworkError" as const,
        message: "无效的用户 ID",
        statusCode: 400,
      }))
    }
    if (id === 403) {
      return yield* Effect.fail(new AuthError({
        _tag: "AuthError" as const,
        message: "无权限访问该用户",
      }))
    }
    return `用户-${id}`
  })

// 模拟校验数据 — 可能因校验失败
const validateData = (data: string): Effect.Effect<string, ValidationError> =>
  Effect.gen(function* () {
    if (data.length === 0) {
      return yield* Effect.fail(new ValidationError({
        _tag: "ValidationError" as const,
        message: "数据不能为空",
        field: "data",
      }))
    }
    return `已验证: ${data}`
  })

// ============================================================
// 3. Effect.catchTag — 按 _tag 精确捕获
// ============================================================

console.log("=== 1. Effect.catchTag — 按 _tag 精确捕获 ===\n")

const program1 = Effect.gen(function* () {
  // fetchUser 可能抛出 NetworkError 或 AuthError
  // catchTag 只捕获 NetworkError，AuthError 继续向上传播
  const result = yield* fetchUser(-1).pipe(
    Effect.catchTag("NetworkError", (err: NetworkError) =>
      Effect.succeed(`网络错误已处理: ${err.message} (状态码: ${err.statusCode})`)
    ),
  )
  return result
})

Effect.runPromise(program1).then(
  (result) => console.log("成功:", result),
)

// 演示 AuthError 没有被 catchTag("NetworkError") 捕获
const program1b = Effect.gen(function* () {
  const result = yield* fetchUser(403).pipe(
    Effect.catchTag("NetworkError", (err: NetworkError) =>
      Effect.succeed(`网络错误已处理: ${err.message}`)
    ),
  )
  return result
})

Effect.runPromise(program1b).then(
  (result) => console.log("成功:", result),
  (err) => console.log("AuthError 未被 NetworkError 的 catchTag 捕获，向上传播:", err.description),
)

// ============================================================
// 4. Effect.catch — 捕获所有错误
// ============================================================

console.log("\n=== 2. Effect.catch — 捕获所有错误 ===\n")

// catch 捕获所有类型的错误，将 Effect<E, A> 变为 Effect<never, A>
// 注意: 类型签名中 E 变为 never — 编译器知道错误已全部处理
// beta.65: 使用 Effect.catch，不是 Effect.catchAll
const program2 = Effect.gen(function* () {
  const result = yield* validateData("").pipe(
    Effect.catch((err: ValidationError) =>
      Effect.succeed(`校验失败已处理: ${err.field} — ${err.message}`)
    ),
  )
  return result
})

Effect.runPromise(program2).then((result) => console.log("成功:", result))

// catch 处理多类型错误
const program2b = Effect.gen(function* () {
  const result = yield* fetchUser(403).pipe(
    Effect.catch((err: NetworkError | AuthError) => {
      // 可以在这里根据错误类型做不同处理
      if (err._tag === "NetworkError") {
        return Effect.succeed(`网络问题，稍后重试: ${err.message}`)
      }
      return Effect.succeed(`权限问题，请登录: ${err.message}`)
    }),
  )
  return result
})

Effect.runPromise(program2b).then((result) => console.log("成功:", result))

// ============================================================
// 5. Effect.catchIf — 选择性捕获
// ============================================================

console.log("\n=== 3. Effect.catchIf — 选择性捕获 ===\n")

// catchIf(predicate, handler) — 只有 predicate 返回 true 才处理
// beta.65: 使用 Effect.catchIf，不是 Effect.catchSome
const program3 = Effect.gen(function* () {
  const result = yield* fetchUser(0).pipe(
    Effect.catchIf(
      (err: NetworkError | AuthError) => err._tag === "NetworkError" && err.statusCode >= 400 && err.statusCode < 500,
      (err: NetworkError) => Effect.succeed(`客户端错误已处理: ${err.message}`),
    ),
  )
  return result
})

Effect.runPromise(program3).then((result) => console.log("成功:", result))

// 演示: catchIf predicate 不匹配时错误继续传播
const program3b = Effect.gen(function* () {
  const result = yield* fetchUser(403).pipe(
    Effect.catchIf(
      (err: NetworkError | AuthError) => err._tag === "NetworkError",
      (err: NetworkError) => Effect.succeed(`网络错误已处理`),
    ),
  )
  return result
})

Effect.runPromise(program3b).then(
  (result) => console.log("成功:", result),
  (err) => console.log("AuthError 未被 catchIf 处理，向上传播:", err.description),
)

// ============================================================
// 6. 错误处理后的类型签名变化
// ============================================================

console.log("\n=== 4. 错误处理后的类型签名变化 ===\n")

// 原始 Effect: Effect<never, NetworkError | AuthError, string>
// catchTag("NetworkError") 后: Effect<never, AuthError, string>
//   — NetworkError 被移除，AuthError 仍在
//
// catch 后: Effect<never, never, string>
//   — 所有错误都被移除
//
// catchIf 后: Effect<never, NetworkError | AuthError, string>
//   — 错误类型不变（因为 predicate 可能不匹配）

// 演示类型变化
const typedExample = fetchUser(42).pipe(
  // 此时类型: Effect<never, NetworkError | AuthError, string>
  Effect.catchTag("NetworkError", (err) =>
    Effect.succeed(`网络错误: ${err.message}`)
  ),
  // 此时类型: Effect<never, AuthError, string>
  // NetworkError 已被处理掉
)

Effect.runPromise(typedExample).then((result) =>
  console.log("catchTag 后 NetworkError 从类型中移除:", result)
)

console.log("\n✅ 01-catch-patterns.ts 运行完成")

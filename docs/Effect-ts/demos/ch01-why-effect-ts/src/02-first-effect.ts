/**
 * 02-first-effect.ts — 第一个 Effect 程序
 *
 * 学习目标: 用 Effect 重写痛点 1 的场景，体验类型安全的错误处理
 * 前置章节: 01-pain-points.ts
 * 运行方式: bun run src/02-first-effect.ts
 */

import { Effect, Schema } from "effect"

// 用 Schema.TaggedErrorClass 定义类型化的错误
class NetworkError extends Schema.TaggedErrorClass<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("NotFoundError", {
  id: Schema.String,
}) {}

// Effect<R, E, A> = Effect<Requirements, Error, Value>
// 错误类型出现在签名中！
const fetchUserData = (id: string): Effect.Effect<never, NetworkError | NotFoundError, { name: string; email: string }> =>
  id === "error"
    ? Effect.fail(new NetworkError({ message: "Connection refused" }))
    : id === "not-found"
      ? Effect.fail(new NotFoundError({ id }))
      : Effect.succeed({ name: "Alice", email: "alice@example.com" })

const program = Effect.gen(function* () {
  // yield* 类似 await，但错误类型被跟踪
  const user = yield* fetchUserData("alice")
  console.log("用户:", user)
})

// 运行: 成功场景
Effect.runSync(program)

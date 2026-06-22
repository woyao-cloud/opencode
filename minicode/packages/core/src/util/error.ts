import { Schema } from "effect"

// 沿用 opencode 的 NamedError 模式：用 Schema.TaggedErrorClass 定义带类型的命名错误。
export class NamedError extends Schema.TaggedErrorClass<NamedError>()("NamedError", {
  module: Schema.String,
  method: Schema.String,
  description: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {
  override get message() {
    return `[${this.module}.${this.method}] ${this.description}`
  }
}

export * as Error from "./error"
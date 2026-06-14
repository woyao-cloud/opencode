/**
 * [config/error] - 配置错误类型定义
 *
 * 功能概述：
 * - 定义配置加载过程中的错误类型（JSON 解析错误、配置验证错误）
 *
 * 核心导出：
 * - JsonError：JSON 解析错误
 * - InvalidError：配置验证错误（含问题列表）
 *
 * 架构位置：位于 config 层，被 config.ts 和 parse.ts 引用
 */
export * as ConfigError from "./error"

import { NamedError } from "@opencode-ai/core/util/error"
import { Schema } from "effect"

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

export const JsonError = NamedError.create("ConfigJsonError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
})

export const InvalidError = NamedError.create("ConfigInvalidError", {
  path: Schema.String,
  issues: Schema.optional(Schema.Array(Issue)),
  message: Schema.optional(Schema.String),
})

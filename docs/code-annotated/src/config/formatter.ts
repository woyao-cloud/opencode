/**
 * [config/formatter] - 格式化器配置模块
 *
 * 功能概述：
 * - 定义格式化器（Formatter）的配置 Schema（禁用状态、命令、环境变量、扩展名）
 *
 * 核心导出：
 * - Entry：格式化器条目配置 Schema
 * - Info：格式化器配置顶层 Schema（布尔或条目字典）
 *
 * 架构位置：下游被 config/config.ts 引用
 */
export * as ConfigFormatter from "./formatter"

import { Schema } from "effect"

export const Entry = Schema.Struct({
  disabled: Schema.optional(Schema.Boolean),
  command: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
  environment: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  extensions: Schema.optional(Schema.mutable(Schema.Array(Schema.String))),
})

export const Info = Schema.Union([Schema.Boolean, Schema.Record(Schema.String, Entry)])
export type Info = Schema.Schema.Type<typeof Info>

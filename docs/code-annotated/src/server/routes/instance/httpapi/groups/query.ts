/**
 * groups/query - 查询参数 Schema 路由组
 *
 * 功能概述：
 * - 定义通用查询参数 Schema（如布尔值解析）
 *
 * 核心导出：
 * - QueryBoolean：布尔值查询参数 Schema
 *
 * 架构位置：HTTP API 路由组，被其他路由组引用
 */

import { Schema, SchemaGetter } from "effect"

export const QueryBoolean = Schema.Literals(["true", "false"]).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value === "true"),
    encode: SchemaGetter.transform((value) => (value ? "true" : "false")),
  }),
)

export const QueryBooleanOpenApi = {
  anyOf: [{ type: "boolean" }, { type: "string", enum: ["true", "false"] }],
}

/**
 * httpapi/errors - HTTP API 错误类型
 *
 * 功能概述：
 * - 定义 HTTP API 层使用的错误类（如 NotFoundError）
 *
 * 核心导出：
 * - ApiNotFoundError：请求未找到错误
 *
 * 架构位置：HTTP API 层，被路由处理器引用
 */

import { Schema } from "effect"

export class ApiNotFoundError extends Schema.ErrorClass<ApiNotFoundError>("NotFoundError")(
  {
    name: Schema.Literal("NotFoundError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 404 },
) {}

export function notFound(message: string) {
  return new ApiNotFoundError({
    name: "NotFoundError",
    data: { message },
  })
}

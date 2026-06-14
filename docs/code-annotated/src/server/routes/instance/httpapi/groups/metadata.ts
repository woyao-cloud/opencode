/**
 * groups/metadata - 元数据 API 路由组
 *
 * 功能概述：
 * - 定义实例元数据相关的 HTTP API 端点
 *
 * 核心导出：
 * - MetadataGroup：元数据 API 路由组
 *
 * 架构位置：HTTP API 路由组
 */

import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"

export function described<S extends Schema.Top>(schema: S, description: string): S {
  return schema.annotate({ description }) as S
}

export function responseDescription(description: string) {
  return OpenApi.annotations({
    transform: (operation) => {
      const response = operation.responses?.["200"]
      if (response && typeof response === "object" && "description" in response) {
        response.description = description
      }
      return operation
    },
  })
}

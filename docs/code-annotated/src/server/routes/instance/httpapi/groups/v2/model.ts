/**
 * groups/v2/model - V2 模型 API 路由组
 *
 * 功能概述：
 * - 定义 V2 版本的模型管理相关 HTTP API 端点
 *
 * 核心导出：
 * - ModelGroup：模型 API 路由组
 *
 * 架构位置：HTTP API V2 路由组，依赖 ModelV2
 */

import { ModelV2 } from "@opencode-ai/core/model"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../../middleware/authorization"
import { LocationQuery, locationQueryOpenApi, V2LocationMiddleware } from "./location"

export const ModelGroup = HttpApiGroup.make("v2.model")
  .add(
    HttpApiEndpoint.get("models", "/api/model", {
      query: LocationQuery,
      success: Schema.Array(ModelV2.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.model.list",
          summary: "List v2 models",
          description: "Retrieve available v2 models ordered by release date.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "v2 models",
      description: "Experimental v2 model routes.",
    }),
  )
  .middleware(V2LocationMiddleware)
  .middleware(Authorization)

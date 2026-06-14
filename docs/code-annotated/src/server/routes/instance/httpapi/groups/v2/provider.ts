/**
 * groups/v2/provider - V2 提供商 API 路由组
 *
 * 功能概述：
 * - 定义 V2 版本的提供商管理相关 HTTP API 端点
 *
 * 核心导出：
 * - ProviderGroup：提供商 API 路由组
 *
 * 架构位置：HTTP API V2 路由组，依赖 ProviderV2
 */

import { ProviderV2 } from "@opencode-ai/core/provider"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ApiNotFoundError } from "../../errors"
import { Authorization } from "../../middleware/authorization"
import { LocationQuery, locationQueryOpenApi, V2LocationMiddleware } from "./location"

export const ProviderGroup = HttpApiGroup.make("v2.provider")
  .add(
    HttpApiEndpoint.get("providers", "/api/provider", {
      query: LocationQuery,
      success: Schema.Array(ProviderV2.Info),
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.list",
          summary: "List v2 providers",
          description: "Retrieve active v2 AI providers so clients can show provider availability and configuration.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("provider", "/api/provider/:providerID", {
      params: { providerID: ProviderV2.ID },
      query: LocationQuery,
      success: ProviderV2.Info,
      error: ApiNotFoundError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.provider.get",
          summary: "Get v2 provider",
          description:
            "Retrieve a single v2 AI provider so clients can inspect its availability and endpoint settings.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "v2 providers",
      description: "Experimental v2 provider routes.",
    }),
  )
  .middleware(V2LocationMiddleware)
  .middleware(Authorization)

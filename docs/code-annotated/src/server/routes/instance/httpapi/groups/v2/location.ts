/**
 * groups/v2/location - V2 位置 API 路由组
 *
 * 功能概述：
 * - 定义 V2 版本的位置服务相关 HTTP API 端点
 *
 * 核心导出：
 * - LocationGroup：位置 API 路由组
 *
 * 架构位置：HTTP API V2 路由组，依赖 Catalog 和 Location 服务
 */

import { Catalog } from "@opencode-ai/core/catalog"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-layer"
import { PluginBoot } from "@opencode-ai/core/plugin/boot"
import { Effect, Layer, Schema } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"

export const LocationQuery = Schema.Struct({
  location: Schema.optional(
    Schema.Struct({
      directory: Schema.optional(Schema.String),
      workspace: Schema.optional(Schema.String),
    }),
  ),
}).annotate({ identifier: "V2LocationQuery" })

export const locationQueryOpenApi = OpenApi.annotations({
  transform: (operation) => {
    const parameters = operation.parameters
    if (!Array.isArray(parameters)) return operation
    return {
      ...operation,
      parameters: parameters.map((parameter) =>
        parameter?.name === "location" && parameter?.in === "query"
          ? { ...parameter, style: "deepObject", explode: true }
          : parameter,
      ),
    }
  },
})

export class V2LocationMiddleware extends HttpApiMiddleware.Service<
  V2LocationMiddleware,
  {
    provides: Catalog.Service | PluginBoot.Service
  }
>()("@opencode/ExperimentalHttpApiV2Location") {}

function ref(request: HttpServerRequest.HttpServerRequest): Location.Ref {
  const query = new URL(request.url, "http://localhost").searchParams
  return {
    directory: query.get("location[directory]") || request.headers["x-opencode-directory"] || process.cwd(),
    workspaceID: query.get("location[workspace]") || request.headers["x-opencode-workspace"],
  }
}

export const layer = Layer.effect(
  V2LocationMiddleware,
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap
    return V2LocationMiddleware.of((effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        return yield* effect.pipe(Effect.provide(locations.get(ref(request))))
      }),
    )
  }),
).pipe(Layer.provide(LocationServiceMap.layer))

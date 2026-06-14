/**
 * groups/event - 事件 API 路由组
 *
 * 功能概述：
 * - 定义事件订阅与推送相关的 HTTP API 端点
 *
 * 核心导出：
 * - EventGroup：事件 API 路由组
 *
 * 架构位置：HTTP API 路由组，依赖 WorkspaceRoutingQuery
 */

import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { WorkspaceRoutingQuery } from "../middleware/workspace-routing"

export const EventPaths = {
  event: "/event",
} as const

export const EventApi = HttpApi.make("event").add(
  HttpApiGroup.make("event")
    .add(
      HttpApiEndpoint.get("subscribe", EventPaths.event, {
        query: WorkspaceRoutingQuery,
        success: Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/event-stream" })),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "event.subscribe",
          summary: "Subscribe to events",
          description: "Get events",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "event", description: "Instance event stream route." })),
)

/**
 * groups/v2 - V2 API 路由组聚合
 *
 * 功能概述：
 * - 聚合 V2 版本的子路由组（消息、模型、提供商、会话）
 *
 * 核心导出：
 * - V2Group：V2 API 路由组
 *
 * 架构位置：HTTP API 路由组，聚合 v2/ 子目录下的多个子路由组
 */

import { HttpApi, OpenApi } from "effect/unstable/httpapi"
import { MessageGroup } from "./v2/message"
import { ModelGroup } from "./v2/model"
import { ProviderGroup } from "./v2/provider"
import { SessionGroup } from "./v2/session"

export const V2Api = HttpApi.make("v2")
  .add(SessionGroup)
  .add(MessageGroup)
  .add(ModelGroup)
  .add(ProviderGroup)
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )

/**
 * handlers/v2 - V2 API 处理器聚合
 *
 * 功能概述：
 * - 聚合 V2 版本各子路由组的处理器 Layer
 *
 * 核心导出：
 * - V2 处理器 Layer
 *
 * 架构位置：HTTP API 处理器层，聚合 v2/ 子目录下的各处理器
 */

import { SessionV2 } from "@/v2/session"
import { Layer } from "effect"
import { layer as v2LocationLayer } from "../groups/v2/location"
import { messageHandlers } from "./v2/message"
import { modelHandlers } from "./v2/model"
import { providerHandlers } from "./v2/provider"
import { sessionHandlers } from "./v2/session"

export const v2Handlers = Layer.mergeAll(sessionHandlers, messageHandlers, modelHandlers, providerHandlers).pipe(
  Layer.provide(v2LocationLayer),
  Layer.provide(SessionV2.defaultLayer),
)

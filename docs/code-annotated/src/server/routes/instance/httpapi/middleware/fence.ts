/**
 * middleware/fence - 操作围栏中间件
 *
 * 功能概述：
 * - 基于 Flag 配置实现操作围栏（Fence）校验
 *
 * 核心导出：
 * - Fence 中间件
 *
 * 架构位置：HTTP API 中间件层，依赖 Flag 模块
 */

import { Flag } from "@opencode-ai/core/flag/flag"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import * as Fence from "@/server/shared/fence"

const ignoredMethods = new Set(["GET", "HEAD", "OPTIONS"])

export const fenceLayer = HttpRouter.middleware<{ handles: unknown }>()((effect) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    if (!Flag.OPENCODE_WORKSPACE_ID || ignoredMethods.has(request.method)) return yield* effect

    const previous = Fence.load()
    const response = yield* effect
    const current = Fence.diff(previous, Fence.load())
    if (Object.keys(current).length === 0) return response

    return HttpServerResponse.setHeader(response, Fence.HEADER, JSON.stringify(current))
  }),
).layer

/**
 * handlers/v2/model - V2 模型 API 处理器
 *
 * 功能概述：
 * - 实现 V2 版本模型管理相关的 HTTP API 端点业务逻辑
 *
 * 核心导出：
 * - V2 模型 API 处理器函数
 *
 * 架构位置：HTTP API V2 处理器层，依赖 Catalog 和 PluginBoot
 */

import { Catalog } from "@opencode-ai/core/catalog"
import { PluginBoot } from "@opencode-ai/core/plugin/boot"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../../api"

export const modelHandlers = HttpApiBuilder.group(InstanceHttpApi, "v2.model", (handlers) =>
  Effect.gen(function* () {
    return handlers.handle(
      "models",
      Effect.fn(function* () {
        const catalog = yield* Catalog.Service
        const pluginBoot = yield* PluginBoot.Service
        yield* pluginBoot.wait()
        return yield* catalog.model.available()
      }),
    )
  }),
)

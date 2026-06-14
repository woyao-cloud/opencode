/**
 * handlers/v2/provider - V2 提供商 API 处理器
 *
 * 功能概述：
 * - 实现 V2 版本提供商管理相关的 HTTP API 端点业务逻辑
 *
 * 核心导出：
 * - V2 提供商 API 处理器函数
 *
 * 架构位置：HTTP API V2 处理器层，依赖 Catalog 和 PluginBoot
 */

import { Catalog } from "@opencode-ai/core/catalog"
import { PluginBoot } from "@opencode-ai/core/plugin/boot"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../../api"
import { notFound } from "../../errors"

export const providerHandlers = HttpApiBuilder.group(InstanceHttpApi, "v2.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "providers",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const pluginBoot = yield* PluginBoot.Service
          yield* pluginBoot.wait()
          return yield* catalog.provider.available()
        }),
      )
      .handle(
        "provider",
        Effect.fn(function* (ctx) {
          const catalog = yield* Catalog.Service
          const pluginBoot = yield* PluginBoot.Service
          yield* pluginBoot.wait()
          return yield* catalog.provider
            .get(ctx.params.providerID)
            .pipe(Effect.catchTag("CatalogV2.ProviderNotFound", () => Effect.fail(notFound("Provider not found"))))
        }),
      )
  }),
)

/**
 * cli/cmd/debug/v2 - "opencode debug v2" 命令
 *
 * 功能概述：
 * - SDK v2 相关调试工具，用于调试 v2 API 集成
 *
 * 核心导出：
 * - V2Command: 使用 effectCmd 封装的 yargs 命令定义
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册，依赖 catalog 和 plugin-boot 模块
 */

import { EOL } from "os"
import { Effect, Layer, Option } from "effect"
import { Catalog } from "@opencode-ai/core/catalog"
import { LocationServiceMap } from "@opencode-ai/core/location-layer"
import { PluginBoot } from "@opencode-ai/core/plugin/boot"
import { effectCmd } from "../../effect-cmd"

const Runtime = Layer.mergeAll(LocationServiceMap.layer)

export const V2Command = effectCmd({
  command: "v2",
  describe: "debug v2 catalog and built-in plugins",
  instance: false,
  handler: Effect.fn("Cli.debug.v2")(
    function* () {
      yield* PluginBoot.Service.use((service) => service.wait())
      const catalog = yield* Catalog.Service
      const providers = (yield* catalog.provider.available()).sort((a, b) => a.id.localeCompare(b.id))
      const all = (yield* catalog.provider.all()).sort((a, b) => a.id.localeCompare(b.id))
      const result = {
        providers,
        default: catalog.model
          .default()
          .pipe(Effect.map(Option.map((item) => item.id)), Effect.map(Option.getOrUndefined)),
        small: Object.fromEntries(
          yield* Effect.all(
            all.map((provider) =>
              Effect.map(
                catalog.model.small(provider.id),
                (model) => [provider.id, Option.getOrUndefined(Option.map(model, (item) => item.id))] as const,
              ),
            ),
            { concurrency: "unbounded" },
          ),
        ),
      }
      process.stdout.write(JSON.stringify(result, null, 2) + EOL)
    },
    Effect.provide(
      LocationServiceMap.get({
        directory: process.cwd(),
      }),
    ),
    Effect.provide(Runtime),
  ),
})

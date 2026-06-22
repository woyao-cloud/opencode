import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "plugin" })
export interface PluginMeta { readonly id: string; readonly version: string }
export interface Interface { readonly list: () => Effect.Effect<ReadonlyArray<PluginMeta>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Plugin") {}
export const layer = Layer.effect(Service, Effect.gen(function* () { log.info("plugin layer initialized (no-op)"); const list = Effect.fn("Plugin.list")(function* () { return [] as ReadonlyArray<PluginMeta> }); return Service.of({ list } as any) }))
export const defaultLayer = layer
export * as Plugin from "."

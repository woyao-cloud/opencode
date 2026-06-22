import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import * as InstanceState from "@/effect/instance-state"
import path from "path"
const log = Log.create({ service: "config" })
export const ConfigAgent = Schema.Struct({ name: Schema.String, description: Schema.optional(Schema.String), model: Schema.optional(Schema.Struct({ providerID: Schema.String, modelID: Schema.String })), prompt: Schema.optional(Schema.String) })
export type ConfigAgent = Schema.Schema.Type<typeof ConfigAgent>
export const ConfigProvider = Schema.Struct({ id: Schema.String, name: Schema.optional(Schema.String), apiKey: Schema.optional(Schema.String), baseURL: Schema.optional(Schema.String) })
export type ConfigProvider = Schema.Schema.Type<typeof ConfigProvider>
export const Info = Schema.Struct({ agents: Schema.Array(ConfigAgent), providers: Schema.Array(ConfigProvider), permission: Schema.Record(Schema.String, Schema.Literals(["allow", "ask", "deny"])), instructions: Schema.optional(Schema.Array(Schema.String)) })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface { readonly get: () => Effect.Effect<Info, unknown, unknown>; readonly reload: () => Effect.Effect<Info, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Config") {}
function defaultConfig(): Info { return { agents: [{ name: "build", description: "Default build agent", prompt: "You are a helpful coding assistant." }], providers: [], permission: { "*": "allow" } } }
async function loadConfig(dir: string): Promise<Info> { const file = Bun.file(path.join(dir, "minicode.json")); if (!await file.exists()) return defaultConfig(); const raw = await file.json().catch(() => defaultConfig()); return { ...defaultConfig(), ...raw } }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* (InstanceState.make<Info>(Effect.fn("Config.state")(function* (ctx: any) { log.info("loading config", { dir: ctx.directory }); return yield* Effect.tryPromise({ try: () => loadConfig(ctx.directory), catch: () => defaultConfig() }) }) as any) as any)
  const get = Effect.fn("Config.get")(function* () { return yield* InstanceState.get(state) })
  const reload = Effect.fn("Config.reload")(function* () { yield* InstanceState.invalidate(state); return yield* InstanceState.get(state) })
  return Service.of({ get, reload } as any)
}))
export const defaultLayer = layer
export * as Config from "./config"

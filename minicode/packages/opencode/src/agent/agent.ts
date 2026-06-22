import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { Config } from "@/config/config"
import * as InstanceState from "@/effect/instance-state"
import { Permission } from "@/permission"
import { ProviderID, ModelID } from "@minicode/llm/schema/ids"
import PROMPT_BUILD from "./prompt/build.txt"
const log = Log.create({ service: "agent" })
export const Info = Schema.Struct({ name: Schema.String, description: Schema.optional(Schema.String), mode: Schema.Literals(["subagent", "primary", "all"]), permission: Permission.Ruleset, model: Schema.optional(Schema.Struct({ modelID: ModelID, providerID: ProviderID })), prompt: Schema.optional(Schema.String) })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface { readonly get: (agent: string) => Effect.Effect<Info, unknown, unknown>; readonly list: () => Effect.Effect<ReadonlyArray<Info>, unknown, unknown>; readonly defaultAgent: () => Effect.Effect<string, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Agent") {}
function defaultInfo(): Info { return { name: "build", description: "Default build agent", mode: "primary", permission: [{ permission: "*", pattern: "*", action: "allow" }], prompt: PROMPT_BUILD } }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  const state = yield* (InstanceState.make<ReadonlyArray<Info>>(Effect.fn("Agent.state")(function* (ctx) {
    const cfg = yield* config.get()
    const fromConfig = cfg.agents.map((a: any): Info => ({ name: a.name, description: a.description, mode: "primary", permission: [{ permission: "*", pattern: "*", action: "allow" }], prompt: a.prompt, model: a.model ? { modelID: ModelID.make(a.model.modelID), providerID: ProviderID.make(a.model.providerID) } : undefined }))
    const agents = fromConfig.length > 0 ? fromConfig : [defaultInfo()]
    log.info("loaded agents", { count: agents.length })
    return agents
  }) as any) as any)
  const get = Effect.fn("Agent.get")(function* (name: string) { const agents = (yield* InstanceState.get(state)) as ReadonlyArray<Info>; return agents.find((a: any) => a.name === name) ?? defaultInfo() })
  const list = Effect.fn("Agent.list")(function* () { return yield* InstanceState.get(state) })
  const defaultAgent = Effect.fn("Agent.defaultAgent")(function* () { return "build" })
  return Service.of({ get, list, defaultAgent } as any)
}))
export const defaultLayer = layer
export * as Agent from "./agent"

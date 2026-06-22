import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import { Config } from "@/config/config"
import * as InstanceState from "@/effect/instance-state"
import { Permission } from "@/permission"
import { ProviderID, ModelID } from "@minicode/llm/schema/ids"
import PROMPT_BUILD from "./prompt/build.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
const log = Log.create({ service: "agent" })
export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  temperature: Schema.optional(Schema.Finite),
  topP: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: Permission.Ruleset,
  model: Schema.optional(Schema.Struct({ modelID: ModelID, providerID: ProviderID })),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  steps: Schema.optional(Schema.Finite),
})
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface { readonly get: (agent: string) => Effect.Effect<Info, unknown, unknown>; readonly list: () => Effect.Effect<ReadonlyArray<Info>, unknown, unknown>; readonly defaultAgent: () => Effect.Effect<string, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Agent") {}

function defaultInfo(): Info {
  return { name: "build", description: "Default build agent", mode: "primary", native: true, permission: [{ permission: "*", pattern: "*", action: "allow" }], prompt: PROMPT_BUILD }
}

function builtinAgents(): Record<string, Info> {
  return {
    build: {
      name: "build",
      description: "The default agent. Executes tools based on configured permissions.",
      mode: "primary",
      native: true,
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
      prompt: PROMPT_BUILD,
    },
    general: {
      name: "general",
      description: "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.",
      mode: "subagent",
      native: true,
      permission: Permission.merge(
        [{ permission: "*", pattern: "*", action: "allow" }],
        [{ permission: "todowrite", pattern: "*", action: "deny" }],
      ),
      prompt: "You are a general-purpose coding assistant. Answer questions clearly and concisely. When given a coding task, write clean, minimal code that solves the problem.",
    },
    explore: {
      name: "explore",
      description: "Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns, search code for keywords, or answer questions about the codebase structure.",
      mode: "subagent",
      native: true,
      permission: Permission.merge(
        [{ permission: "*", pattern: "*", action: "deny" }],
        [
          { permission: "grep", pattern: "*", action: "allow" },
          { permission: "glob", pattern: "*", action: "allow" },
          { permission: "read", pattern: "*", action: "allow" },
          { permission: "bash", pattern: "*", action: "allow" },
        ],
      ),
      prompt: PROMPT_EXPLORE,
    },
  }
}

export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  const state = yield* (InstanceState.make<ReadonlyArray<Info>>(Effect.fn("Agent.state")(function* (ctx) {
    const cfg = yield* config.get()
    const agents = builtinAgents()

    // Override with user config
    const agentMap = agents as Record<string, Info>
    for (const a of cfg.agents) {
      const existing = agentMap[a.name]
      if (existing) {
        agentMap[a.name] = {
          ...existing,
          prompt: a.prompt ?? existing.prompt,
          description: a.description ?? existing.description,
          model: a.model ? { modelID: ModelID.make(a.model.modelID), providerID: ProviderID.make(a.model.providerID) } : existing.model,
        }
      } else {
        agentMap[a.name] = {
          name: a.name,
          description: a.description,
          mode: "all",
          native: false,
          permission: [{ permission: "*", pattern: "*", action: "allow" }],
          prompt: a.prompt,
          model: a.model ? { modelID: ModelID.make(a.model.modelID), providerID: ProviderID.make(a.model.providerID) } : undefined,
        }
      }
    }

    const result = Object.values(agents)
    log.info("loaded agents", { count: result.length })
    return result
  }) as any) as any)
  const get = Effect.fn("Agent.get")(function* (name: string) { const agents = (yield* InstanceState.get(state)) as ReadonlyArray<Info>; return agents.find((a: any) => a.name === name) ?? defaultInfo() })
  const list = Effect.fn("Agent.list")(function* () { return yield* InstanceState.get(state) })
  const defaultAgent = Effect.fn("Agent.defaultAgent")(function* () { return "build" })
  return Service.of({ get, list, defaultAgent } as any)
}))
export const defaultLayer = layer
export * as Agent from "./agent"

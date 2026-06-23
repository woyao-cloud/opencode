import { Effect, Context, Layer } from "effect"
import type { MiniOpenCodeConfig } from "@/config/config"

export interface AgentInfo {
  readonly id: string
  readonly model: string
  readonly system: string
  readonly permissions: ReadonlyArray<string>
}

export interface AgentShape {
  readonly get: (id?: string) => Effect.Effect<AgentInfo, Error>
  readonly list: () => Effect.Effect<ReadonlyArray<string>, Error>
  readonly defaultAgent: () => Effect.Effect<AgentInfo, Error>
}

export class AgentService extends Context.Service<AgentService, AgentShape>()("@miniopencode/Agent") {}

export function makeAgent(agentConfig: MiniOpenCodeConfig["agent"]): AgentShape {
  const defaultId = agentConfig?.default ?? "default"
  const agents = (agentConfig?.agents ?? {}) as Record<string, { model?: string; system?: string; permissions?: string[] }>

  const makeDefault = (id: string): AgentInfo => ({
    id,
    model: "glm-5.1",
    system: "You are a helpful assistant.",
    permissions: ["allow:*"],
  })

  return {
    get: (id?: string) => {
      const agentId = id ?? defaultId
      const entry = agents[agentId]
      if (!entry) return Effect.succeed(makeDefault(agentId))
      return Effect.succeed({
        id: agentId,
        model: entry.model ?? "glm-5.1",
        system: entry.system ?? "You are a helpful assistant.",
        permissions: entry.permissions ?? ["allow:*"],
      } as AgentInfo)
    },
    list: () => Effect.succeed(Object.keys(agents) as ReadonlyArray<string>),
    defaultAgent: () => {
      const entry = agents[defaultId] ?? agents[Object.keys(agents)[0]]
      if (entry) {
        return Effect.succeed({
          id: defaultId,
          model: entry.model ?? "glm-5.1",
          system: entry.system ?? "You are a helpful assistant.",
          permissions: entry.permissions ?? ["allow:*"],
        } as AgentInfo)
      }
      return Effect.succeed(makeDefault(defaultId))
    },
  }
}

export const AgentLive = Layer.succeed(AgentService, makeAgent({ default: "default", agents: {} }))

import { Effect, Context, Layer } from "effect"
import type { MiniOpenCodeConfig } from "@/config/config"
import { ConfigService } from "@/config/config"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "agent" })

export interface AgentInfo {
  readonly id: string
  readonly name: string
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

// ── Built-in Subagent Definitions ──────────────────────────

export const BUILTIN_AGENTS: Record<string, AgentInfo> = {
  build: {
    id: "build",
    name: "BuildAgent",
    model: "glm-5.1",
    system: `You are a build agent. Your job is to implement code changes, fix bugs, and write tests.
Use the Bash tool to run builds and tests. Always verify your changes compile and pass tests.
Return a summary of files changed and verification results.`,
    permissions: ["allow:*"],
  },
  general: {
    id: "general",
    name: "GeneralAgent",
    model: "glm-5.1",
    system: `You are a general-purpose AI assistant. Complete the assigned task thoroughly and carefully.

Use the available tools (Read, Write, Bash, Glob, Grep) to accomplish the task.
When writing code, follow the existing codebase patterns.
Return a clear summary of what you did.`,
    permissions: ["allow:*", "deny:task:*", "deny:todowrite:*"],
  },
  explore: {
    id: "explore",
    name: "ExploreAgent",
    model: "glm-5.1",
    system: `You are a codebase exploration specialist. Your task is to search, read, and understand the codebase.

Use tools like Grep (content search), Glob (file search), and Read (file reading).
Start broad with Grep/Glob, then drill down by reading the most promising files.
Return a comprehensive summary with file paths and relevant code snippets.`,
    permissions: ["allow:glob:*", "allow:grep:*", "allow:read:*", "deny:*"],
  },
}

export function makeAgent(agentConfig: MiniOpenCodeConfig["agent"]): AgentShape {
  const defaultId = agentConfig?.default ?? "default"
  const userAgents = (agentConfig?.agents ?? {}) as Record<string, { model?: string; system?: string; permissions?: string[] }>
  const allAgents = { ...BUILTIN_AGENTS, ...userAgents }

  const makeDefault = (id: string): AgentInfo => ({
    id,
    name: "Default",
    model: "glm-5.1",
    system: "You are a helpful assistant.",
    permissions: ["allow:*"],
  })

  const findAgent = (id: string): AgentInfo | undefined => {
    const entry = allAgents[id]
    if (!entry) return undefined
    if (userAgents[id]) {
      const props = entry as Record<string, unknown>
      return {
        id,
        name: typeof props.name === "string" ? props.name : id,
        model: typeof props.model === "string" ? props.model : "glm-5.1",
        system: typeof props.system === "string" ? props.system : "You are a helpful assistant.",
        permissions: Array.isArray(props.permissions) ? props.permissions as string[] : ["allow:*"],
      }
    }
    return BUILTIN_AGENTS[id] as AgentInfo | undefined
  }

  return {
    get: (id?: string) => {
      const agentId = id ?? defaultId
      const found = findAgent(agentId)
      if (found) {
        log.debug("agent found", { id: agentId })
        return Effect.succeed(found)
      }
      log.debug("agent not found, using default", { id: agentId })
      return Effect.succeed(makeDefault(agentId))
    },
    list: () => Effect.succeed(Object.keys(allAgents) as ReadonlyArray<string>),
    defaultAgent: () => {
      const entry = allAgents[defaultId] ?? allAgents[Object.keys(allAgents)[0]]
      if (entry) {
        const props = entry as Record<string, unknown>
        const info: AgentInfo = {
          id: defaultId,
          name: typeof props.name === "string" ? props.name : defaultId,
          model: typeof props.model === "string" ? props.model : "glm-5.1",
          system: typeof props.system === "string" ? props.system : "You are a helpful assistant.",
          permissions: Array.isArray(props.permissions) ? props.permissions as string[] : ["allow:*"],
        }
        return Effect.succeed(info)
      }
      return Effect.succeed(makeDefault(defaultId))
    },
  }
}

export const AgentLive = Layer.effect(
  AgentService,
  Effect.gen(function* () {
    const cfg = yield* ConfigService
    return makeAgent(cfg.config.agent)
  }),
)

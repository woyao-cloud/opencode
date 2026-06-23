import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { makeAgent } from "@/agent/agent"
import type { AgentShape } from "@/agent/agent"
import { makePermission } from "@/permission/index"
import type { PermissionShape } from "@/permission/index"
import type { MiniOpenCodeConfig } from "@/config/config"

const log = Log.create({ service: "project" })

export interface ProjectShape {
  readonly directory: Effect.Effect<string, Error>
  readonly config: Effect.Effect<MiniOpenCodeConfig, Error>
  readonly agent: Effect.Effect<unknown, Error>
  readonly permission: Effect.Effect<unknown, Error>
}

export class ProjectService extends Context.Service<ProjectService, ProjectShape>()("@miniopencode/Project") {}

export function makeProject(directory: string, config: MiniOpenCodeConfig, agent: AgentShape, permission: PermissionShape): ProjectShape {
  return {
    directory: Effect.succeed(directory),
    config: Effect.succeed(config),
    agent: agent.defaultAgent(),
    permission: Effect.succeed(permission),
  }
}

// Standalone default layer; bootstrap.ts creates its own with real values.
export const ProjectLive = Layer.succeed(
  ProjectService,
  makeProject("", { agent: {}, provider: {}, permission: {} } as MiniOpenCodeConfig, makeAgent({}), makePermission({})),
)

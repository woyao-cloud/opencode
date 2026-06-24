import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { makeAgent } from "@/agent/agent"
import type { AgentShape } from "@/agent/agent"
import { makePermission } from "@/permission/index"
import type { PermissionShape } from "@/permission/index"
import { ConfigService } from "@/config/config"
import { AgentService } from "@/agent/agent"
import { PermissionService } from "@/permission/index"
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

// Effect-based factory: reads ConfigService + AgentService + PermissionService
export function makeProjectLive(directory: string): Layer.Layer<ProjectService, never, ConfigService | AgentService | PermissionService> {
  return Layer.effect(
    ProjectService,
    Effect.gen(function* () {
      const { config } = yield* ConfigService
      const agent = yield* AgentService
      const permission = yield* PermissionService
      return makeProject(directory, config, agent, permission)
    }),
  )
}

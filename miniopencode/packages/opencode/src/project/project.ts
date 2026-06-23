import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { InstanceRef } from "@/effect/instance-ref"
import { ConfigService } from "@/config/config"
import { AgentService } from "@/agent/agent"
import { PermissionService } from "@/permission/index"

const log = Log.create({ service: "project" })

export interface ProjectShape {
  readonly directory: Effect.Effect<string, Error>
  readonly config: Effect.Effect<unknown, Error>
  readonly agent: Effect.Effect<unknown, Error>
  readonly permission: Effect.Effect<unknown, Error>
}

export class ProjectService extends Context.Service<ProjectService, ProjectShape>()("@miniopencode/Project") {}

export const ProjectLive = Layer.effect(
  ProjectService,
  Effect.gen(function* () {
    const ref = yield* InstanceRef
    const config = yield* ConfigService
    const agent = yield* AgentService
    const permission = yield* PermissionService

    return {
      directory: Effect.succeed(ref.directory),
      config: Effect.succeed(config.config),
      agent: agent.defaultAgent(),
      permission: Effect.succeed(permission),
    }
  }),
)

// ── Project Handlers ─────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProjectService } from "@/project/project"
import { InstanceHttpApi } from "../api"

export const projectHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "project", (handlers: any) =>
  Effect.gen(function* () {
    const project = yield* ProjectService

    handlers.handle("projectGet", () =>
      Effect.gen(function* () {
        const dir = yield* project.directory
        const cfg = yield* project.config
        return { directory: dir, config: cfg }
      })
    )

    handlers.handle("projectDirectory", () =>
      project.directory
    )

    return handlers
  })
)

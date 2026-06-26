// ── Workspace Handlers ───────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const workspaceHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "workspace", (handlers: any) =>
  Effect.gen(function* () {

    handlers.handle("workspaceGet", () =>
      Effect.succeed({ directory: process.cwd() })
    )

    handlers.handle("workspaceCreate", (request: any) =>
      Effect.succeed({ directory: request.payload.directory })
    )

    return handlers
  })
)

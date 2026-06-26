// ── TUI Handlers ─────────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const tuiHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "tui", (handlers: any) =>
  Effect.gen(function* () {

    handlers.handle("tuiState", () =>
      Effect.succeed({ state: "idle" })
    )

    handlers.handle("tuiAction", (request: any) =>
      Effect.succeed({ action: request.payload.action, result: "ok" })
    )

    return handlers
  })
)

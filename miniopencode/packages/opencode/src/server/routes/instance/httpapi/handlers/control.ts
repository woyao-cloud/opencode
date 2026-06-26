// ── Control Handlers ────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const controlHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "control", (handlers: any) =>
  Effect.gen(function* () {

    handlers.handle("controlShutdown", () =>
      Effect.sync(() => {
        process.exit(0)
      })
    )

    handlers.handle("controlRestart", () =>
      Effect.succeed(undefined)
    )

    return handlers
  })
)

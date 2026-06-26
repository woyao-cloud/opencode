// ── Global Handlers ──────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const globalHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "global", (handlers: any) =>
  Effect.gen(function* () {

    handlers.handle("globalHealth", () =>
      Effect.succeed({
        status: "ok",
        uptime: process.uptime(),
      })
    )

    handlers.handle("globalVersion", () =>
      Effect.succeed("0.1.0")
    )

    return handlers
  })
)

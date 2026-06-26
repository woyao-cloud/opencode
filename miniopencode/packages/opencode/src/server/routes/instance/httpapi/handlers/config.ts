// ── Config Handlers ─────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ConfigService } from "@/config/config"
import { InstanceHttpApi } from "../api"

export const configHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "config", (handlers: any) =>
  Effect.gen(function* () {
    const config = yield* ConfigService

    handlers.handle("configGet", () =>
      Effect.succeed(config.config)
    )

    handlers.handle("configAgent", () =>
      Effect.succeed(config.config.agent ?? {})
    )

    handlers.handle("configProvider", () =>
      Effect.succeed(config.config.provider ?? {})
    )

    return handlers
  })
)

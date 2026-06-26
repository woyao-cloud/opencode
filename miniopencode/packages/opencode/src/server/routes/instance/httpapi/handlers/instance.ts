// ── Instance Handlers ───────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const instanceHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "instance", (handlers: any) =>
  Effect.gen(function* () {

    handlers.handle("instanceInfo", () =>
      Effect.succeed({
        version: process.version,
        platform: process.platform,
        cwd: process.cwd(),
      })
    )

    handlers.handle("instanceHealth", () =>
      Effect.succeed({
        status: "ok",
        uptime: process.uptime(),
      })
    )

    return handlers
  })
)

// ── Sync Handlers ────────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const syncHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "sync", (handlers: any) =>
  Effect.gen(function* () {

    handlers.handle("syncStatus", () =>
      Effect.succeed({ status: "idle", lastSync: null })
    )

    handlers.handle("syncPush", () =>
      Effect.succeed(undefined)
    )

    handlers.handle("syncPull", () =>
      Effect.succeed(undefined)
    )

    return handlers
  })
)

// ── V2 Handlers ──────────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const v2Handlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "v2", (handlers: any) =>
  Effect.gen(function* () {

    handlers.handle("v2Session", () =>
      Effect.succeed([])
    )

    handlers.handle("v2Message", () =>
      Effect.succeed([])
    )

    handlers.handle("v2Model", () =>
      Effect.succeed([])
    )

    handlers.handle("v2Provider", () =>
      Effect.succeed([])
    )

    return handlers
  })
)

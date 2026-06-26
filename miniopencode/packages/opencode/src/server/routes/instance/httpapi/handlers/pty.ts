// ── PTY Handlers ─────────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { PtyServiceTag } from "@/pty"
import { InstanceHttpApi } from "../api"

export const ptyHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "pty", (handlers: any) =>
  Effect.gen(function* () {
    const pty = yield* PtyServiceTag

    handlers.handle("ptyList", () =>
      Effect.succeed([])
    )

    handlers.handle("ptyCreate", (request: any) =>
      Effect.succeed({ id: "pty-1" })
    )

    return handlers
  })
)

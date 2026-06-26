// ── Event Handlers — SSE event stream ────────────────────────────

import { Effect, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { BusService } from "@/bus"
import { InstanceHttpApi } from "../api"

export const eventHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "event", (handlers: any) =>
  Effect.gen(function* () {
    const bus = yield* BusService

    handlers.handle("eventStream", () =>
      Effect.gen(function* () {
        const stream = bus.subscribeAll()
        return Stream.map(stream, (event) => JSON.stringify(event))
      })
    )

    return handlers
  })
)

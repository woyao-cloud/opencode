// ── Event API Group — SSE event stream ───────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const EventGroup = HttpApiGroup.make("event")
  .add(
    HttpApiEndpoint.get("eventStream", "/event", {
      success: Schema.String,
    }),
  )

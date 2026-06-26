// ── Global API Group ─────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const GlobalGroup = HttpApiGroup.make("global")
  .add(
    HttpApiEndpoint.get("globalHealth", "/global/health", {
      success: Schema.Struct({
        status: Schema.String,
        uptime: Schema.Number,
      }),
    }),
    HttpApiEndpoint.get("globalVersion", "/global/version", {
      success: Schema.String,
    }),
  )

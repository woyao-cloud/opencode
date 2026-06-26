// ── Config API Group ─────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const ConfigGroup = HttpApiGroup.make("config")
  .add(
    HttpApiEndpoint.get("configGet", "/config", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.get("configAgent", "/config/agent", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.get("configProvider", "/config/provider", {
      success: Schema.Unknown,
    }),
  )

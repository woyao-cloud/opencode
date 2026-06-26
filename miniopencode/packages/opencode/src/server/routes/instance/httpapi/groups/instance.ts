// ── Instance API Group ───────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const InstanceGroup = HttpApiGroup.make("instance")
  .add(
    HttpApiEndpoint.get("instanceInfo", "/instance", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.get("instanceHealth", "/instance/health", {
      success: Schema.Struct({
        status: Schema.String,
        uptime: Schema.Number,
      }),
    }),
  )

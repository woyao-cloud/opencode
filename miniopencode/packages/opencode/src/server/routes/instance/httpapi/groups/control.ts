// ── Control API Group ────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const ControlGroup = HttpApiGroup.make("control")
  .add(
    HttpApiEndpoint.post("controlShutdown", "/control/shutdown", {
      success: Schema.Void,
    }),
    HttpApiEndpoint.post("controlRestart", "/control/restart", {
      success: Schema.Void,
    }),
  )

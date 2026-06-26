// ── PTY API Group ────────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const PTYGroup = HttpApiGroup.make("pty")
  .add(
    HttpApiEndpoint.get("ptyList", "/pty", {
      success: Schema.Array(Schema.Unknown),
    }),
    HttpApiEndpoint.post("ptyCreate", "/pty", {
      payload: Schema.Struct({
        command: Schema.optional(Schema.String),
      }),
      success: Schema.Unknown,
    }),
  )

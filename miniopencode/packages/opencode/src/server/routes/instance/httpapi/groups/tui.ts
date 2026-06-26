// ── TUI API Group ────────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const TUIGroup = HttpApiGroup.make("tui")
  .add(
    HttpApiEndpoint.get("tuiState", "/tui", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.post("tuiAction", "/tui/action", {
      payload: Schema.Struct({
        action: Schema.String,
      }),
      success: Schema.Unknown,
    }),
  )

// ── V2 API Group ─────────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const V2Group = HttpApiGroup.make("v2")
  .add(
    HttpApiEndpoint.get("v2Session", "/v2/session", {
      success: Schema.Array(Schema.Unknown),
    }),
    HttpApiEndpoint.get("v2Message", "/v2/message", {
      success: Schema.Array(Schema.Unknown),
    }),
    HttpApiEndpoint.get("v2Model", "/v2/model", {
      success: Schema.Array(Schema.Unknown),
    }),
    HttpApiEndpoint.get("v2Provider", "/v2/provider", {
      success: Schema.Array(Schema.Unknown),
    }),
  )

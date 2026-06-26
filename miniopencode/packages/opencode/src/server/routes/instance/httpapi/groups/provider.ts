// ── Provider API Group ──────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const ProviderGroup = HttpApiGroup.make("provider")
  .add(
    HttpApiEndpoint.get("providerList", "/provider", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.get("providerResolve", "/provider/resolve", {
      query: Schema.Struct({
        model: Schema.optional(Schema.String),
        provider: Schema.optional(Schema.String),
      }),
      success: Schema.Unknown,
    }),
  )

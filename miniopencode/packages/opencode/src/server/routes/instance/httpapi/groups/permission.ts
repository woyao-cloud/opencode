// ── Permission API Group ─────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const PermissionGroup = HttpApiGroup.make("permission")
  .add(
    HttpApiEndpoint.get("permissionGet", "/permission", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.get("permissionEvaluate", "/permission/evaluate", {
      query: Schema.Struct({
        tool: Schema.String,
      }),
      success: Schema.Unknown,
    }),
  )

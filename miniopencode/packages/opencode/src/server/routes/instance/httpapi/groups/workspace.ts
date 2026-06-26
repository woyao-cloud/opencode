// ── Workspace API Group ──────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const WorkspaceGroup = HttpApiGroup.make("workspace")
  .add(
    HttpApiEndpoint.get("workspaceGet", "/workspace", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.post("workspaceCreate", "/workspace", {
      payload: Schema.Struct({
        directory: Schema.String,
      }),
      success: Schema.Unknown,
    }),
  )

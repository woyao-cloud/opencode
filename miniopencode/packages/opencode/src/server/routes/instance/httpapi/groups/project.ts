// ── Project API Group ────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const ProjectGroup = HttpApiGroup.make("project")
  .add(
    HttpApiEndpoint.get("projectGet", "/project", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.get("projectDirectory", "/project/directory", {
      success: Schema.String,
    }),
  )

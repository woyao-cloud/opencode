// ── File API Group ───────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const FileGroup = HttpApiGroup.make("file")
  .add(
    HttpApiEndpoint.get("fileRead", "/file/read", {
      query: Schema.Struct({ path: Schema.String }),
      success: Schema.String,
    }),
    HttpApiEndpoint.post("fileWrite", "/file/write", {
      payload: Schema.Struct({
        path: Schema.String,
        content: Schema.String,
      }),
      success: Schema.Void,
    }),
    HttpApiEndpoint.get("fileExists", "/file/exists", {
      query: Schema.Struct({ path: Schema.String }),
      success: Schema.Boolean,
    }),
  )

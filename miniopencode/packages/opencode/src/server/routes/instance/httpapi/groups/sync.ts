// ── Sync API Group ────────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const SyncGroup = HttpApiGroup.make("sync")
  .add(
    HttpApiEndpoint.get("syncStatus", "/sync", {
      success: Schema.Unknown,
    }),
    HttpApiEndpoint.post("syncPush", "/sync/push", {
      success: Schema.Void,
    }),
    HttpApiEndpoint.post("syncPull", "/sync/pull", {
      success: Schema.Void,
    }),
  )

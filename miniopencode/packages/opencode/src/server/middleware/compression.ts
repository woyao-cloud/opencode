// ── Compression Middleware ───────────────────────────────────────

import { Effect } from "effect"
import { HttpRouter } from "effect/unstable/http"

export const compressionLayer = (HttpRouter.middleware as any)(
  () => Effect.succeed(undefined),
  { global: true },
)

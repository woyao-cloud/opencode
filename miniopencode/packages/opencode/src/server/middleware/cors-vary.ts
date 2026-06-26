// ── CORS Vary Fix Middleware ────────────────────────────────────

import { Effect } from "effect"
import { HttpRouter } from "effect/unstable/http"

export const corsVaryFix = (HttpRouter.middleware as any)(
  () => Effect.succeed(undefined),
  { global: true },
)

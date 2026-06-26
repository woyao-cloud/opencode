// ── Schema Error Middleware Layer ────────────────────────────────

import { Effect } from "effect"
import { HttpRouter } from "effect/unstable/http"

export const schemaErrorLayer = (HttpRouter.middleware as any)(
  () => Effect.succeed(undefined),
  { global: true },
)

// ── Error Middleware — unified error responses ───────────────────

import { Effect } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/unstable/http"

export const errorLayer = (HttpRouter.middleware as any)(
  (handler: any) =>
    Effect.catch(handler, (error: unknown) =>
      HttpServerResponse.json({ error: String(error) }, { status: 500 }),
    ),
  { global: true },
)

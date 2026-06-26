// ── Authorization Middleware ─────────────────────────────────────

import { Effect } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiMiddleware } from "effect/unstable/httpapi"

export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "@miniopencode/Authorization",
  {},
) {}

export const authorizationLayer = (HttpRouter.middleware as any)(
  () => Effect.succeed(undefined),
  { global: true },
)

export const authorizationRouterMiddleware = (HttpRouter.middleware as any)(
  () => Effect.succeed(undefined),
  { global: true },
)

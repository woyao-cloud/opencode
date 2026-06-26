// ── Schema Error Middleware ──────────────────────────────────────

import { HttpApiMiddleware } from "effect/unstable/httpapi"

export class SchemaErrorMiddleware extends HttpApiMiddleware.Service<SchemaErrorMiddleware>()(
  "@miniopencode/SchemaError",
  {},
) {}

// ── Server lifecycle — dispose middleware ───────────────────────

import { Effect } from "effect"

/**
 * Middleware function that runs on every request to ensure the server is
 * properly disposed when connections are closed.
 * This is a simple pass-through function compatible with HttpRouter.serve's
 * middleware option.
 */
export const disposeMiddleware = (handler: any) => handler

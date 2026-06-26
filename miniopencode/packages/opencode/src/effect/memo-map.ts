// ── Memo Map — Layer memoization utility ─────────────────────────

import { Layer } from "effect"

/**
 * A memo map for Layer.buildWithMemoMap. In Effect v4 beta.65,
 * this is provided by Layer.makeMemoMapUnsafe() directly.
 */
export const memoMap = Layer.makeMemoMapUnsafe()

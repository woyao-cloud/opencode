// ── Wildcard Pattern Matching ─────────────────────────────────
// Converts glob-style wildcard patterns (e.g. "read:.env", "write:src/**")
// into RegExp for efficient matching. Used by the permission system
// to match tool invocation patterns against permission rules.

const RE_ESCAPE = /[.+^${}()|[\]\\]/g
const RE_STAR = /\*/g

/**
 * Convert a glob-style pattern to a RegExp string.
 * - `*` matches any sequence of characters (including empty)
 * - All other special regex chars are escaped
 */
export function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(RE_ESCAPE, "\\$&").replace(RE_STAR, ".*")
  return new RegExp(`^${escaped}$`)
}

/**
 * Match a target string against a glob-style pattern.
 * Returns `true` if the target matches.
 *
 * Examples:
 *   matchWildcard("read:*", "read:.env")        → true
 *   matchWildcard("read:*", "write:foo")        → false
 *   matchWildcard("allow:*", "anything")        → true
 *   matchWildcard("write:src/**", "write:src/app.ts") → true
 */
export function matchWildcard(pattern: string, target: string): boolean {
  if (pattern === "*" || pattern === "allow:*") return true
  if (pattern === target) return true
  try {
    return patternToRegex(pattern).test(target)
  } catch {
    return false
  }
}

/**
 * Check if a pattern is a prefix-style pattern (ends with `*`).
 * These are common in permission rules like "read:*" or "git:*"
 */
export function isPrefixPattern(pattern: string): boolean {
  return pattern.endsWith("*") && !pattern.includes("*", pattern.length - 1)
}

/**
 * Get the prefix portion of a prefix pattern.
 * "read:*" → "read:"
 * "git:*"  → "git:"
 */
export function getPrefix(pattern: string): string {
  if (!isPrefixPattern(pattern)) return pattern
  return pattern.slice(0, -1)
}

export * as Wildcard from "./wildcard"

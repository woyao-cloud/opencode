// ── Command Arity Matching ─────────────────────────────────────
// Matches permission patterns based on command "arity" (token count).
// For example, "git checkout main" has arity 2 (git/checkout).
// This allows fine-grained permission rules like "deny:git:checkout:*"
// to match "git checkout main" but not "git status".

/**
 * Get the arity (first N tokens) from a command string.
 * "git checkout main" → ["git", "git:checkout", "git:checkout:main"]
 */
export function tokenizeCommand(command: string): ReadonlyArray<string> {
  const tokens = command.trim().split(/\s+/)
  const result: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    result.push(tokens.slice(0, i + 1).join(":"))
  }
  return result
}

/**
 * Match a permission pattern against a command string by arity.
 * Checks each arity level (1-token, 2-token, etc.) against the pattern.
 *
 * Example:
 *   pattern = "git:checkout:*", command = "git checkout main"
 *   tokenizeCommand("git checkout main") → ["git", "git:checkout", "git:checkout:main"]
 *   matchArity("git:checkout:*", ["git", "git:checkout", "git:checkout:main"]) → true
 */
export function matchArity(
  pattern: string,
  command: string,
  matchFn: (pattern: string, target: string) => boolean = (p, t) => p === t || p === `${t}:*`,
): boolean {
  const arities = tokenizeCommand(command)
  for (const arity of arities) {
    if (matchFn(pattern, arity)) return true
  }
  // Also check if the pattern itself is a direct match for the full command
  if (matchFn(pattern, command.replace(/\s+/g, ":"))) return true
  return false
}

/**
 * Check if a permission pattern looks like an arity-based pattern
 * (contains at least one colon after the action prefix).
 * "git:checkout:*" → true
 * "read:*"         → false (single colon, tool-level pattern)
 */
export function isArityPattern(pattern: string): boolean {
  const stripped = pattern.replace(/^(allow:|deny:|ask:)/, "")
  return stripped.includes(":")
}

export * as Arity from "./arity"

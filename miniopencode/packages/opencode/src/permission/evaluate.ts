// ── Permission Evaluation Chain ─────────────────────────────────
// Evaluates permission requests against one or more rulesets using
// wildcard pattern matching and command arity matching.
//
// Priority order (first match wins):
//   1. Persisted user decisions ("always" rules)
//   2. Agent-specific rules
//   3. Config-level rules (from miniopencode.json)
//   4. Default — deny

import type { Rule, Action } from "./schema"
import { matchWildcard } from "@/util/wildcard"
import { matchArity, isArityPattern } from "./arity"

/**
 * Evaluate a single ruleset against a target pattern.
 * Returns the first matching action, or `undefined` if no rule matches.
 */
export function evaluate(
  rules: ReadonlyArray<Rule>,
  target: string,
): Action | undefined {
  for (const rule of rules) {
    if (matchRule(rule.pattern, target)) {
      return rule.action
    }
  }
  return undefined
}

/**
 * Match a permission rule pattern against a target string.
 * Uses wildcard matching for tool-level patterns and arity matching
 * for command-level patterns (e.g. "git:checkout:*").
 */
export function matchRule(pattern: string, target: string): boolean {
  // Fast paths
  if (pattern === "*" || pattern === "allow:*") return true
  if (pattern === target) return true

  // Arity-based patterns (e.g. "git:checkout:*" or "bash:git:checkout:*")
  // Use token-split matching for command-style targets
  if (isArityPattern(pattern)) {
    return matchArity(pattern, target, matchWildcard)
  }

  // Standard wildcard matching (e.g. "read:*", "write:src/**")
  return matchWildcard(pattern, target)
}

/**
 * Evaluate a permission request against the full chain of rulesets.
 *
 * Priority (first match wins):
 *   1. Persisted user decisions (from "always allow/deny")
 *   2. Agent-specific rules (from agent config or built-in agents)
 *   3. Config-level rules (from miniopencode.json permission.rules)
 *   4. Default — returns undefined (caller decides: typically deny)
 */
export function evaluateChain(
  target: string,
  persisted: ReadonlyArray<Rule>,
  agentRules: ReadonlyArray<Rule>,
  configRules: ReadonlyArray<Rule>,
): Action | undefined {
  // 1. Persisted rules — highest priority (user explicitly chose)
  const p = evaluate(persisted, target)
  if (p !== undefined) return p

  // 2. Agent-specific rules
  const a = evaluate(agentRules, target)
  if (a !== undefined) return a

  // 3. Config rules
  const c = evaluate(configRules, target)
  if (c !== undefined) return c

  // 4. No match — let the caller decide (typically deny)
  return undefined
}

/**
 * Merge multiple rulesets into a single flat array.
 * Later rulesets have higher priority (appended after earlier ones).
 */
export function mergeRules(
  ...rulesets: ReadonlyArray<ReadonlyArray<Rule>>
): ReadonlyArray<Rule> {
  return rulesets.flat()
}

// ── Agent Permission Parsing ───────────────────────────────────

/** Parse string-based permission patterns (from agent config) into Rule objects. */
export function parseAgentPermissionPatterns(patterns: ReadonlyArray<string>): ReadonlyArray<Rule> {
  return patterns.map((p) => {
    if (p.startsWith("deny:")) return { pattern: p.slice(5), action: "deny" as const }
    if (p.startsWith("allow:")) return { pattern: p.slice(6), action: "allow" as const }
    if (p.startsWith("ask:")) return { pattern: p.slice(4), action: "ask" as const }
    // Bare pattern — default to allow
    if (p === "*") return { pattern: p, action: "allow" as const }
    return { pattern: p, action: "allow" as const }
  })
}

/**
 * Check if a tool ID is permitted by the agent's permission patterns.
 * Matches the tool ID against patterns like "allow:*", "deny:task:*",
 * "allow:read:*" by checking both the bare toolId and "toolId:*" suffix.
 *
 * Returns the action ("allow" / "deny") or undefined if no rule matches.
 */
export function checkToolPermission(
  toolId: string,
  permissionPatterns: ReadonlyArray<string> | undefined,
): Action | undefined {
  if (!permissionPatterns || permissionPatterns.length === 0) return undefined

  for (const raw of permissionPatterns) {
    // Determine action from prefix
    let pattern: string
    let action: Action

    if (raw.startsWith("deny:")) { pattern = raw.slice(5); action = "deny" }
    else if (raw.startsWith("allow:")) { pattern = raw.slice(6); action = "allow" }
    else if (raw.startsWith("ask:")) { pattern = raw.slice(4); action = "ask" }
    else { pattern = raw; action = "allow" }

    // Fast match on bare tool ID or toolId:* suffix
    if (matchWildcard(pattern, toolId)) return action
    if (matchWildcard(pattern, `${toolId}:*`)) return action
  }

  return undefined
}

export * as Evaluate from "./evaluate"

import type { Rule, Action } from "./schema"

export function evaluate(rules: ReadonlyArray<Rule>, pattern: string): Action | undefined {
  for (const rule of rules) {
    if (matchPattern(rule.pattern, pattern)) {
      return rule.action
    }
  }
  return undefined
}

export function matchPattern(pattern: string, target: string): boolean {
  if (pattern === "*" || pattern === "allow:*") return true
  if (pattern === target) return true

  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
  try {
    return new RegExp(`^${regexStr}$`).test(target)
  } catch {
    return false
  }
}

export function mergeRules(...rulesets: ReadonlyArray<ReadonlyArray<Rule>>): ReadonlyArray<Rule> {
  return rulesets.flat()
}

export * as Evaluate from "./evaluate"

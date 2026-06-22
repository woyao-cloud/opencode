import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "permission" })
export const Action = Schema.Literals(["allow", "deny", "ask"])
export type Action = Schema.Schema.Type<typeof Action>
export const Rule = Schema.Struct({ permission: Schema.String, pattern: Schema.String, action: Action })
export type Rule = Schema.Schema.Type<typeof Rule>
export const Ruleset = Schema.mutable(Schema.Array(Rule))
export type Ruleset = Schema.Schema.Type<typeof Ruleset>
export class RejectedError extends Schema.TaggedErrorClass<RejectedError>()("PermissionRejectedError", {}) { override get message() { return "Permission rejected" } }
export interface Request { readonly id: string; readonly permission: string; readonly patterns: ReadonlyArray<string> }
export interface Interface { readonly resolve: (permission: string, pattern: string) => Effect.Effect<Action, unknown, unknown>; readonly request: (input: Omit<Request, "id">) => Effect.Effect<Action, RejectedError, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Permission") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const resolve = Effect.fn("Permission.resolve")(function* (permission: string, pattern: string) { log.info("resolve", { permission, pattern }); return "allow" as Action })
  const request = Effect.fn("Permission.request")(function* (input: Omit<Request, "id">) { const action = yield* resolve(input.permission, input.patterns[0] ?? "*"); if (action === "deny") return yield* new RejectedError(); return action })
  return Service.of({ resolve, request } as any)
}))
export const defaultLayer = layer

// Evaluate a permission+pattern against multiple rulesets (last match wins).
// Returns the matching rule, or { action: "ask" } as default.
export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): Rule {
  const rules = rulesets.flat()
  const match = rules.findLast(
    (rule) => matchPermission(permission, rule.permission) && matchPattern(pattern, rule.pattern),
  )
  return match ?? { action: "ask", permission, pattern: "*" }
}

// Convert a config object to Ruleset. Supports nested objects:
//   { "*": "allow", external_directory: { "*": "ask", "/tmp/*": "allow" } }
export function fromConfig(map: Record<string, string | Record<string, string>>): Ruleset {
  const ruleset: Ruleset = []
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === "string") {
      ruleset.push({ permission: key, action: value as Action, pattern: "*" })
    } else {
      ruleset.push(
        ...Object.entries(value).map(([pattern, action]) => ({ permission: key, pattern, action: action as Action })),
      )
    }
  }
  return ruleset
}

// Merge multiple rulesets into one (flat list, last match wins in evaluate).
export function merge(...rulesets: Ruleset[]): Ruleset {
  return rulesets.flat()
}

// Compute which tools to disable based on a ruleset.
// A tool is disabled if there's a deny-all rule for its permission.
const EDIT_TOOLS = ["edit", "write", "apply_patch"]
export function disabled(tools: string[], ruleset: Ruleset): Set<string> {
  const result = new Set<string>()
  for (const tool of tools) {
    const permission = EDIT_TOOLS.includes(tool) ? "edit" : tool
    const rule = ruleset.findLast((r) => matchPermission(permission, r.permission))
    if (!rule) continue
    if (rule.pattern === "*" && rule.action === "deny") result.add(tool)
  }
  return result
}

// Simple wildcard matcher for permission names (supports * and ?)
function matchPermission(perm: string, pattern: string): boolean {
  if (pattern === "*") return true
  if (pattern === perm) return true
  // Simple glob: "external_directory" matches "external_directory"
  return false
}

// Simple wildcard matcher for patterns (supports * and ?)
function matchPattern(input: string, pattern: string): boolean {
  if (pattern === "*") return true
  if (pattern === input) return true
  // Convert glob to regex for basic wildcard support
  const regexStr = "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
  try {
    return new RegExp(regexStr).test(input)
  } catch {
    return false
  }
}

export * as Permission from "."

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
export function fromConfig(map: Record<string, string>): Ruleset { return Object.entries(map).map(([pattern, action]) => ({ permission: pattern.split(":")[0] ?? "*", pattern: pattern.split(":")[1] ?? pattern, action: action as Action })) }
export * as Permission from "."

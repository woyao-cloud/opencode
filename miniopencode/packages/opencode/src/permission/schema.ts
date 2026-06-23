import { Schema } from "effect"

export const PermissionID = Schema.String.pipe(Schema.brand("PermissionID"))
export type PermissionID = Schema.Schema.Type<typeof PermissionID>

export const Action = Schema.Literals(["allow", "deny", "ask"])
export type Action = Schema.Schema.Type<typeof Action>

export const Rule = Schema.Struct({
  pattern: Schema.String,
  action: Action,
})
export type Rule = Schema.Schema.Type<typeof Rule>

export const Ruleset = Schema.Struct({
  rules: Schema.Array(Rule),
})
export type Ruleset = Schema.Schema.Type<typeof Ruleset>

export * as PermissionSchema from "./schema"

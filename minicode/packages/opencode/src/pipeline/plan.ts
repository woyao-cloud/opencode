import { Schema } from "effect"

export const PlanStatus = Schema.Literals(["planned", "building", "built", "failed"])
export type PlanStatus = typeof PlanStatus.Type

export const PlanFile = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
  deps: Schema.optional(Schema.Array(Schema.String)),
})
export type PlanFile = typeof PlanFile.Type

export const PlanSchema = Schema.Struct({
  name: Schema.String,
  files: Schema.Array(PlanFile),
  status: PlanStatus,
})
export type Plan = typeof PlanSchema.Type

export * as Plan from "./plan"

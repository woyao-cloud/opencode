import { Schema } from "effect"

export const AgentConfigSchema = Schema.Struct({
  default: Schema.optional(Schema.String),
  agents: Schema.optional(Schema.Record(Schema.String, Schema.Struct({
    model: Schema.optional(Schema.String),
    system: Schema.optional(Schema.String),
    permissions: Schema.optional(Schema.Array(Schema.String)),
  }))),
})
export type AgentConfigSchema = Schema.Schema.Type<typeof AgentConfigSchema>

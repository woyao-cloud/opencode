import { Schema } from "effect"

export const ProviderConfigSchema = Schema.Struct({
  providers: Schema.optional(Schema.Record(Schema.String, Schema.Struct({
    apiKey: Schema.optional(Schema.String),
    baseURL: Schema.optional(Schema.String),
    model: Schema.optional(Schema.String),
  }))),
})
export type ProviderConfigSchema = Schema.Schema.Type<typeof ProviderConfigSchema>

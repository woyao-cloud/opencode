import { Schema } from "effect"

export const ProviderID = Schema.String.pipe(Schema.brand("ProviderID"))
export type ProviderID = Schema.Schema.Type<typeof ProviderID>

export const ModelID = Schema.String.pipe(Schema.brand("ModelID"))
export type ModelID = Schema.Schema.Type<typeof ModelID>

export * as IDs from "./ids"

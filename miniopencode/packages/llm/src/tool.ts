import { Schema } from "effect"

export const ToolSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  parameters: Schema.Unknown,
})
export type ToolSchema = Schema.Schema.Type<typeof ToolSchema>

export * as Tool from "./tool"

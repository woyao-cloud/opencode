import { Schema } from "effect"
import { ProviderID, ModelID } from "./ids"

export const TextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
})
export type TextPart = Schema.Schema.Type<typeof TextPart>

export const ToolCallPart = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  input: Schema.Unknown,
})
export type ToolCallPart = Schema.Schema.Type<typeof ToolCallPart>

export const ToolResultPart = Schema.Struct({
  type: Schema.Literal("tool-result"),
  id: Schema.String,
  name: Schema.String,
  result: Schema.Unknown,
})
export type ToolResultPart = Schema.Schema.Type<typeof ToolResultPart>

export const ContentPart = Schema.Union([TextPart, ToolCallPart, ToolResultPart])
export type ContentPart = Schema.Schema.Type<typeof ContentPart>

export const MessageRole = Schema.Literals(["system", "user", "assistant", "tool"])
export type MessageRole = Schema.Schema.Type<typeof MessageRole>

export const Message = Schema.Struct({
  role: MessageRole,
  content: Schema.Union([Schema.String, Schema.Array(ContentPart)]),
})
export type Message = Schema.Schema.Type<typeof Message>

export class ToolDefinition extends Schema.Class<ToolDefinition>("ToolDefinition")({
  name: Schema.String,
  description: Schema.String,
  inputSchema: Schema.Unknown,
}) {}

export const ModelRef = Schema.Struct({
  providerID: ProviderID,
  modelID: ModelID,
  apiKey: Schema.optional(Schema.String),
  baseURL: Schema.optional(Schema.String),
})
export type ModelRef = Schema.Schema.Type<typeof ModelRef>

export const GenerationOptions = Schema.Struct({
  maxTokens: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number),
  topP: Schema.optional(Schema.Number),
  stop: Schema.optional(Schema.Array(Schema.String)),
  system: Schema.optional(Schema.String),
})
export type GenerationOptions = Schema.Schema.Type<typeof GenerationOptions>

export * as Messages from "./messages"

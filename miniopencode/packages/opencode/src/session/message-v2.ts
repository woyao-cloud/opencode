// ── MessageV2 — Part-based rich message model ─────────────────
// Builds on top of the basic MessageRow from schema.ts, adding
// typed parts (text, tool, reasoning, file, step-start, step-finish)
// and a WithParts wrapper. Stored parts are serialized as JSON in
// the MessageRow.row content field, keyed by type.

import { Schema } from "effect"
import type { MessageRow } from "./schema"

// ── Part Schemas ─────────────────────────────────────────────

export const TextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  synthetic: Schema.optional(Schema.Boolean),
  ignored: Schema.optional(Schema.Boolean),
  time: Schema.optional(
    Schema.Struct({
      start: Schema.Number,
      end: Schema.optional(Schema.Number),
    }),
  ),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
})
export type TextPart = Schema.Schema.Type<typeof TextPart>

export const ReasoningPart = Schema.Struct({
  type: Schema.Literal("reasoning"),
  text: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
  time: Schema.Struct({
    start: Schema.Number,
    end: Schema.optional(Schema.Number),
  }),
})
export type ReasoningPart = Schema.Schema.Type<typeof ReasoningPart>

export const ToolPart = Schema.Struct({
  type: Schema.Literal("tool"),
  callID: Schema.String,
  tool: Schema.String,
  input: Schema.Record(Schema.String, Schema.Any),
  output: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Any)),
  time: Schema.optional(
    Schema.Struct({
      start: Schema.Number,
      end: Schema.optional(Schema.Number),
    }),
  ),
})
export type ToolPart = Schema.Schema.Type<typeof ToolPart>

export const FilePart = Schema.Struct({
  type: Schema.Literal("file"),
  mime: Schema.String,
  filename: Schema.optional(Schema.String),
  url: Schema.String,
})
export type FilePart = Schema.Schema.Type<typeof FilePart>

export const StepStartPart = Schema.Struct({
  type: Schema.Literal("step-start"),
  snapshot: Schema.optional(Schema.String),
})
export type StepStartPart = Schema.Schema.Type<typeof StepStartPart>

export const StepFinishPart = Schema.Struct({
  type: Schema.Literal("step-finish"),
  reason: Schema.String,
  cost: Schema.optional(Schema.Number),
  tokens: Schema.optional(
    Schema.Struct({
      input: Schema.Number,
      output: Schema.Number,
    }),
  ),
})
export type StepFinishPart = Schema.Schema.Type<typeof StepFinishPart>

export const Part = Schema.Union([
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
]).annotate({ discriminator: "type", identifier: "Part" })
export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | FilePart
  | StepStartPart
  | StepFinishPart

// ── Message Info (user / assistant) ──────────────────────────

export const UserInfo = Schema.Struct({
  role: Schema.Literal("user"),
  agent: Schema.String,
  model: Schema.optional(Schema.String),
  time: Schema.Struct({
    created: Schema.Number,
  }),
})
export type UserInfo = Schema.Schema.Type<typeof UserInfo>

export const AssistantInfo = Schema.Struct({
  role: Schema.Literal("assistant"),
  agent: Schema.String,
  model: Schema.String,
  time: Schema.Struct({
    created: Schema.Number,
    completed: Schema.optional(Schema.Number),
  }),
  cost: Schema.optional(Schema.Number),
  tokens: Schema.optional(
    Schema.Struct({
      input: Schema.Number,
      output: Schema.Number,
    }),
  ),
})
export type AssistantInfo = Schema.Schema.Type<typeof AssistantInfo>

export const Info = Schema.Union([UserInfo, AssistantInfo]).annotate({
  discriminator: "role",
  identifier: "MessageV2.Info",
})
export type Info = UserInfo | AssistantInfo

// ── WithParts — message info + parts array ────────────────────

export interface WithParts {
  readonly info: Info & { readonly id: string; readonly sessionID: string }
  readonly parts: Part[]
}

// ── Serialisation helpers ─────────────────────────────────────

const partEncode = Schema.encodeUnknownSync(Part)
const partDecode = Schema.decodeUnknownSync(Part)

/** Encode a Part array into a JSON string for storage in MessageRow.content */
export function encodeParts(parts: Part[]): string {
  return JSON.stringify(parts.map((p) => partEncode(p)))
}

/** Decode a JSON string from MessageRow.content back into a Part array */
export function decodeParts(json: string): Part[] {
  const raw = JSON.parse(json)
  if (!Array.isArray(raw)) return []
  return raw.map((p) => partDecode(p))
}

// ── Build WithParts from a MessageRow ────────────────────────

export function fromMessageRow(row: MessageRow): WithParts {
  const base = {
    id: row.id,
    sessionID: row.session_id,
  }

  // Attempt to parse content as JSON parts array
  let parts: Part[] = []
  try {
    parts = decodeParts(row.content)
  } catch {
    // Legacy content — wrap as single text part
    parts = [{ type: "text", text: row.content }]
  }

  let info: Info
  if (row.role === "user" || row.role === "system") {
    info = { role: "user", agent: "default", time: { created: row.created_at } }
  } else if (row.role === "tool") {
    // Tool result messages wrap as user messages with a single tool part
    const toolName = row.tool_name ?? "unknown"
    return {
      info: { ...base, role: "assistant", agent: "default", model: "unknown", time: { created: row.created_at } },
      parts: [{
        type: "tool",
        callID: row.id,
        tool: toolName,
        input: row.tool_args_json ? JSON.parse(row.tool_args_json) : {},
        output: row.content,
      }],
    }
  } else {
    info = { role: "assistant", agent: "default", model: "unknown", time: { created: row.created_at } }
  }

  return { info: { ...base, ...info as any }, parts }
}

// ── Create a message from parts ──────────────────────────────

export function createMessage(
  id: string,
  sessionID: string,
  role: "user" | "assistant",
  parts: Part[],
  extra?: Partial<Info>,
): WithParts {
  const time = { created: Date.now() }
  let info: Info
  if (role === "user") {
    info = { role: "user", agent: "default", time, ...extra as any }
  } else {
    info = { role: "assistant", agent: "default", model: "unknown", time, ...extra as any }
  }
  return { info: { id, sessionID, ...info as any }, parts }
}

export * as MessageV2 from "./message-v2"

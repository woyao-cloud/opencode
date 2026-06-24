import { Schema } from "effect"

// ── Typed Event Definition ──────────────────────────────────

export type Definition<Type extends string = string, Properties extends Schema.Top = Schema.Top> = {
  readonly type: Type
  readonly properties: Properties
}

export function define<Type extends string, Properties extends Schema.Top>(
  type: Type,
  properties: Properties,
): Definition<Type, Properties> {
  return { type, properties }
}

// ── Session Events ──────────────────────────────────────────

export const SessionCreated = define("session:created", Schema.Struct({ id: Schema.String }))
export const SessionUpdated = define("session:updated", Schema.Struct({ id: Schema.String, status: Schema.String }))
export const SessionDeleted = define("session:deleted", Schema.Struct({ id: Schema.String }))
export const MessageAdded = define("message:added", Schema.Struct({ sessionId: Schema.String, messageId: Schema.String }))

export * as BusEvent from "./bus-event"

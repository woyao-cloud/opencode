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
export const SessionStatusChanged = define("session:status:changed", Schema.Struct({
  sessionId: Schema.String,
  status: Schema.String,
  detail: Schema.optional(Schema.String),
}))

// ── Background Task Events ──────────────────────────────────

export const BackgroundTaskCompleted = define("background:task:completed", Schema.Struct({
  taskId: Schema.String,
  sessionId: Schema.String,
  description: Schema.String,
  text: Schema.String,
}))

export const BackgroundTaskFailed = define("background:task:failed", Schema.Struct({
  taskId: Schema.String,
  sessionId: Schema.String,
  description: Schema.String,
  error: Schema.String,
}))

// ── Permission Events ────────────────────────────────────────

export const PermissionRequested = define("permission:requested", Schema.Struct({
  id: Schema.String,
  pattern: Schema.String,
  sessionId: Schema.optional(Schema.String),
  agentId: Schema.optional(Schema.String),
}))

export const PermissionResponded = define("permission:responded", Schema.Struct({
  id: Schema.String,
  pattern: Schema.String,
  action: Schema.String,
  always: Schema.optional(Schema.Boolean),
}))

export * as BusEvent from "./bus-event"

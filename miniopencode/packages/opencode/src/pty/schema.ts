/**
 * pty/schema.ts — PTY Schema 类型定义
 */

import { Schema } from "effect"

export const PtyID = Schema.String
export type PtyID = Schema.Schema.Type<typeof PtyID>

export const PtyInfo = Schema.Struct({
  id: PtyID,
  title: Schema.String,
  command: Schema.String,
  args: Schema.Array(Schema.String),
  cwd: Schema.String,
  status: Schema.Literals(["running", "exited"]),
  pid: Schema.Number,
})
export type PtyInfo = Schema.Schema.Type<typeof PtyInfo>

export const CreateInput = Schema.Struct({
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  cwd: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
export type CreateInput = Schema.Schema.Type<typeof CreateInput>

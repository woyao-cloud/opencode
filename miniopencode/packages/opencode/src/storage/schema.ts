/**
 * storage/schema.ts — 存储 Schema 定义
 *
 * 定义存储键的命名空间和默认值
 */

import { Schema } from "effect"

// ===== 存储键命名空间 =====

export const Keys = {
  config: ["config"],
  sessions: ["sessions"],
  agents: ["agents"],
  permissions: ["permissions"],
  tools: ["tools"],
} as const

// ===== 存储值 Schema =====

export const StoredSession = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  title: Schema.optional(Schema.String),
  messageCount: Schema.Number,
  status: Schema.String,
})
export type StoredSession = Schema.Schema.Type<typeof StoredSession>

export const StoredAgent = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  model: Schema.String,
  provider: Schema.String,
  systemPrompt: Schema.optional(Schema.String),
  createdAt: Schema.Number,
})
export type StoredAgent = Schema.Schema.Type<typeof StoredAgent>

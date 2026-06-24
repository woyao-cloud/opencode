// ── Session Schema — TypeScript types + Drizzle table defs ──

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

// ── TypeScript Types ────────────────────────────────────────

export type SessionStatus = "idle" | "running" | "error"
export type MessageRole = "user" | "assistant" | "system" | "tool"

export interface SessionRow {
  id: string
  status: SessionStatus
  title: string
  created_at: number
  updated_at: number
  agent_id: string
  model_id: string | null
  metadata_json: string | null   // JSON blob for arbitrary metadata
}

export interface MessageRow {
  id: string
  session_id: string
  role: MessageRole
  content: string
  created_at: number
  tool_name: string | null        // populated when role === "tool"
  tool_args_json: string | null   // JSON args for tool calls
}

// ── Drizzle Table Definitions ───────────────────────────────

export const sessionTable = sqliteTable("session", {
  id: text().primaryKey(),
  status: text().notNull().default("idle"),
  title: text().notNull().default(""),
  created_at: integer().notNull(),
  updated_at: integer().notNull(),
  agent_id: text().default("default"),
  model_id: text(),
  metadata_json: text(),
})

export const messageTable = sqliteTable("message", {
  id: text().primaryKey(),
  session_id: text()
    .notNull()
    .references(() => sessionTable.id, { onDelete: "cascade" }),
  role: text().notNull(),
  content: text().notNull(),
  created_at: integer().notNull(),
  tool_name: text(),
  tool_args_json: text(),
})

export * as SessionSchema from "./schema"

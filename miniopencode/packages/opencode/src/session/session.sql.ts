// ── Drizzle Table Definitions ────────────────────────────────
// Session, message, and permission_rule tables for the database schema.
// Extends the existing schema from schema.ts with the permission_rule table.

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"

// ── Timestamps Helper ──────────────────────────────────────

export const Timestamps = {
  created_at: integer().notNull().$default(() => Date.now()),
  updated_at: integer()
    .notNull()
    .$default(() => Date.now())
    .$onUpdate(() => Date.now()),
}

// ── Session Table ──────────────────────────────────────────

export const sessionTable = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    status: text().notNull().default("idle"),
    title: text().notNull().default(""),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
    agent_id: text().default("default"),
    model_id: text(),
    metadata_json: text(),
    permission_rules_json: text(),
  },
  (table) => [index("session_created_idx").on(table.created_at)],
)

// ── Message Table ──────────────────────────────────────────

export const messageTable = sqliteTable(
  "message",
  {
    id: text().primaryKey(),
    session_id: text()
      .notNull()
      .references(() => sessionTable.id, { onDelete: "cascade" }),
    role: text().notNull(),
    content: text().notNull(),
    created_at: integer().notNull(),
    tool_name: text(),
    tool_args_json: text(),
  },
  (table) => [index("message_session_idx").on(table.session_id, table.created_at)],
)

// ── Permission Rule Table ──────────────────────────────────
// Stores user "always allow/deny" permission decisions.

export const permissionRuleTable = sqliteTable(
  "permission_rule",
  {
    id: text().primaryKey(),
    pattern: text().notNull(),
    action: text({ enum: ["allow", "deny"] }).notNull(),
    created_at: integer().notNull(),
  },
  (table) => [index("permission_rule_pattern_idx").on(table.pattern)],
)

// ── Schema for runtime table creation (used by migrator) ──

export const sessionSchema = {
  session: sessionTable,
  message: messageTable,
  permission: permissionRuleTable,
}

export * as SessionSql from "./session.sql"

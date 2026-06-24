// ── Project Table Definition ─────────────────────────────────

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/session/session.sql"

export const projectTable = sqliteTable("project", {
  id: text().primaryKey(),
  worktree: text().notNull(),
  vcs: text(),
  name: text(),
  ...Timestamps,
  time_initialized: integer(),
})

export const projectSchema = {
  project: projectTable,
}

export * as ProjectSql from "./project.sql"

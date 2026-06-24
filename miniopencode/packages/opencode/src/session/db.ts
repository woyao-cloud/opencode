// ── Database Initialization ─────────────────────────────────
// Uses raw bun:sqlite instead of drizzle-orm to avoid a persistent
// incompatibility with drizzle(bun.Database) in the Effect runtime.

import fs from "fs"
import path from "path"
import { Database } from "bun:sqlite"
import { Global } from "@miniopencode/core/global"

let _db: Database | null = null

/** Get or initialize the SQLite database. Creates file + tables on first call. */
export function getDb(): Database {
  if (_db) return _db

  // Ensure state directory exists
  const dbPath = Global.Path.db
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  _db = new Database(dbPath)
  _db.run("PRAGMA journal_mode = WAL")
  _db.run("PRAGMA foreign_keys = ON")

  migrate()

  return _db
}

function migrate() {
  if (!_db) return

  _db.run(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      agent_id TEXT DEFAULT 'default',
      model_id TEXT,
      metadata_json TEXT,
      permission_rules_json TEXT
    )
  `)

  _db.run(`
    CREATE TABLE IF NOT EXISTS message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      tool_name TEXT,
      tool_args_json TEXT
    )
  `)

  _db.run(`
    CREATE INDEX IF NOT EXISTS idx_message_session
    ON message(session_id, created_at)
  `)

  // Permission decision persistence — stores user "always allow/deny" choices
  _db.run(`
    CREATE TABLE IF NOT EXISTS permission_rule (
      id TEXT PRIMARY KEY,
      pattern TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('allow', 'deny')),
      created_at INTEGER NOT NULL
    )
  `)
}

/** Close the database connection. */
export function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}

export * as SessionDb from "./db"

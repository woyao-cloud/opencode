// ── Database Initialization ─────────────────────────────────
// Delegates connection management to storage/db, exposes raw bun:sqlite
// Database for backward compatibility with session/session.ts and permission.
//
// Uses raw bun:sqlite instead of drizzle-orm to avoid a persistent
// incompatibility with drizzle(bun.Database) in the Effect runtime.

import { Database } from "bun:sqlite"
import { getDb as getStorageDb } from "@/storage/db"

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'idle',
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    agent_id TEXT DEFAULT 'default',
    model_id TEXT,
    metadata_json TEXT,
    permission_rules_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    tool_name TEXT,
    tool_args_json TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_message_session ON message(session_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS permission_rule (
    id TEXT PRIMARY KEY,
    pattern TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('allow', 'deny')),
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS data_migration (
    name TEXT PRIMARY KEY,
    time_completed INTEGER NOT NULL
  )`,
]

let _migrated = false

function ensureMigrated(): void {
  if (_migrated) return
  // Open the storage db (initializes PRAGMAs and dirs)
  const drizzleDb = getStorageDb()
  const client = drizzleDb.$client as Database
  for (const sql of SCHEMA_SQL) {
    client.run(sql)
  }
  _migrated = true
}

/** Get or initialize the SQLite database connection (raw bun:sqlite). */
export function getDb(): Database {
  ensureMigrated()
  const drizzleDb = getStorageDb()
  return drizzleDb.$client as Database
}

/** Close the database connection. */
export function closeDb(): void {
  _migrated = false
  // storage/db manages the connection lifecycle
}

export * as SessionDb from "./db"

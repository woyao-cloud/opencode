// ── Bun SQLite Drizzle Init ──────────────────────────────────
// Bun-specific database initialization with PRAGMAs and migration support.

import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import fs from "fs"
import path from "path"

export type BunSQLiteDatabase = ReturnType<typeof drizzle>

/** Per-table Drizzle schema maps for runtime migration. */
export type SchemaMap = Record<string, any>

/**
 * Initialize a Bun SQLite database with Drizzle.
 * Applies PRAGMAs for performance and safety, then runs schema migrations.
 */
export function init(
  dbPath: string,
  options?: {
    /** Drizzle table schemas to push (for dev-mode migration). */
    schemas?: SchemaMap
    /** Directory containing SQL migration files. */
    migrationDir?: string
    /** Skip PRAGMA application. */
    skipPragmas?: boolean
  },
): BunSQLiteDatabase {
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const sqlite = new Database(dbPath, { create: true })

  if (!options?.skipPragmas) {
    sqlite.run("PRAGMA journal_mode = WAL")
    sqlite.run("PRAGMA synchronous = NORMAL")
    sqlite.run("PRAGMA busy_timeout = 5000")
    sqlite.run("PRAGMA cache_size = -64000")
    sqlite.run("PRAGMA foreign_keys = ON")
    sqlite.run("PRAGMA wal_checkpoint(PASSIVE)")
  }

  const db = drizzle({ client: sqlite })

  // Apply SQL migration files if a migration directory is provided
  if (options?.migrationDir && fs.existsSync(options.migrationDir)) {
    migrate(db, { migrationsFolder: options.migrationDir })
  }

  return db
}

/**
 * Run raw SQL migrations (inline CREATE TABLE statements).
 * Useful for simple schemas without a migration directory.
 */
export function runMigrations(
  db: BunSQLiteDatabase,
  migrations: string[],
): void {
  const client = db.$client as Database
  for (const sql of migrations) {
    client.run(sql)
  }
}

export * as DbBun from "./db.bun"

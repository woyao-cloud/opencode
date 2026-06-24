// ── DB Connection Manager ────────────────────────────────────
// Provides a singleton database connection with PRAGMAs and migration runner.
// Uses Effect for proper lifecycle management.

import { Effect, Context, Layer, Scope } from "effect"
import { Global } from "@miniopencode/core/global"
import * as Log from "@miniopencode/core/util/log"
import { init as initBunDb, type BunSQLiteDatabase } from "./db.bun"

const log = Log.create({ service: "storage.db" })

// ── Types ───────────────────────────────────────────────────

export type Database = BunSQLiteDatabase

export interface DbShape {
  readonly db: Database
  readonly close: () => void
}

// ── Service ────────────────────────────────────────────────

export class DbService extends Context.Service<DbService, DbShape>()("@miniopencode/Db") {}

// ── Factory ────────────────────────────────────────────────

let _instance: Database | undefined

/**
 * Get or create the singleton database connection.
 * On first call, initializes the database with PRAGMAs and runs migrations.
 */
export function getDb(options?: {
  /** Skip PRAGMA application (for test isolation). */
  skipPragmas?: boolean
}): Database {
  if (_instance) return _instance

  const dbPath = Global.Path.db
  log.info("opening database", { path: dbPath })

  _instance = initBunDb(dbPath, { skipPragmas: options?.skipPragmas })
  return _instance
}

/** Run raw CREATE TABLE migrations. */
export function runMigrations(sqlStatements: string[]): void {
  const db = getDb()
  const client = db.$client as import("bun:sqlite").Database
  for (const sql of sqlStatements) {
    try {
      client.run(sql)
    } catch (e) {
      log.warn("migration statement failed", { sql: sql.slice(0, 80), error: String(e) })
    }
  }
}

/** Close the database connection. */
export function closeDb(): void {
  if (_instance) {
    try {
      ;(_instance.$client as import("bun:sqlite").Database).close()
    } catch (e) {
      log.warn("error closing database", { error: String(e) })
    }
    _instance = undefined
  }
}

/** Reset the singleton (for testing). */
export function resetDb(): void {
  _instance = undefined
}

// ── Effect-based Lifecycle ─────────────────────────────────

/**
 * Scoped database access — the connection is opened when acquired
 * and closed when the scope ends.
 */
export const scopedDb: Effect.Effect<Database, never, Scope.Scope> =
  Effect.acquireRelease(
    Effect.sync(() => getDb()),
    () => Effect.sync(() => closeDb()),
  )

// ── Exports ────────────────────────────────────────────────

export * as StorageDb from "./db"

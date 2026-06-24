// ── Data Migration Framework ─────────────────────────────────
// Runs data migrations (one-time transformations) in a background fiber.
// Tracks completion via the data_migration SQLite table.

import { Effect, Context, Layer } from "effect"
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import * as Log from "@miniopencode/core/util/log"
import { getDb } from "@/storage/db"

const log = Log.create({ service: "data-migration" })

// ── Migration Type ─────────────────────────────────────────

export type Migration<R = never> = {
  name: string
  run: Effect.Effect<void, unknown, R>
}

// ── Drizzle Table for Tracking ─────────────────────────────

import { sqliteTable as drizzleTable } from "drizzle-orm/sqlite-core"

export const DataMigrationTable = drizzleTable("data_migration", {
  name: text().primaryKey(),
  time_completed: integer().notNull(),
})

// ── Service Type ───────────────────────────────────────────

export interface DataMigrationShape {
  readonly run: (migrations: Migration[]) => Effect.Effect<void>
}

export class DataMigrationService extends Context.Service<DataMigrationService, DataMigrationShape>()("@miniopencode/DataMigration") {}

// ── Factory ────────────────────────────────────────────────

export function makeDataMigration(): DataMigrationShape {
  return {
    run: (migrations) =>
      Effect.gen(function* () {
        if (migrations.length === 0) return

        for (const migration of migrations) {
          const db = getDb()
          // Check if migration already completed
          const existing = db.$client
            .prepare("SELECT name FROM data_migration WHERE name = ?")
            .get(migration.name) as { name: string } | undefined

          if (existing) {
            log.info("migration already completed", { name: migration.name })
            continue
          }

          log.info("running data migration", { name: migration.name })
          yield* migration.run.pipe(
            Effect.catchAll((error) =>
              Effect.sync(() => {
                log.error("migration failed", { name: migration.name, error: String(error) })
              }),
            ),
          )

          // Record completion
          db.$client
            .prepare("INSERT OR IGNORE INTO data_migration (name, time_completed) VALUES (?, ?)")
            .run(migration.name, Date.now())
        }
      }),
  }
}

// ── Layer ───────────────────────────────────────────────────

export const DataMigrationLive = Layer.succeed(DataMigrationService, makeDataMigration())

export * as DataMigration from "./data-migration"

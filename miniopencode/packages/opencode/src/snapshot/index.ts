// ── Snapshot Service ─────────────────────────────────────────
// Basic JSON snapshot create/restore for sessions.
// Stores snapshots as JSON files keyed by session ID + timestamp.

import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { Global } from "@miniopencode/core/global"
import fs from "fs"
import path from "path"

const log = Log.create({ service: "snapshot" })

// ── Types ───────────────────────────────────────────────────

export interface Snapshot {
  id: string
  sessionId: string
  createdAt: number
  data: unknown
}

export interface SnapshotShape {
  readonly create: (sessionId: string, data: unknown) => Effect.Effect<string>
  readonly restore: (sessionId: string, snapshotId: string) => Effect.Effect<unknown>
  readonly list: (sessionId: string) => Effect.Effect<Snapshot[]>
  readonly remove: (sessionId: string, snapshotId: string) => Effect.Effect<void>
}

export class SnapshotService extends Context.Service<SnapshotService, SnapshotShape>()("@miniopencode/Snapshot") {}

// ── Helpers ─────────────────────────────────────────────────

function snapshotDir(sessionId: string): string {
  return path.join(Global.Path.state, "snapshots", sessionId)
}

function snapshotPath(sessionId: string, snapshotId: string): string {
  return path.join(snapshotDir(sessionId), `${snapshotId}.json`)
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// ── Factory ─────────────────────────────────────────────────

export function makeSnapshot(): SnapshotShape {
  const base = path.join(Global.Path.state, "snapshots")
  ensureDir(base)

  return {
    create: (sessionId, data) =>
      Effect.sync(() => {
        const dir = snapshotDir(sessionId)
        ensureDir(dir)
        const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const snapshot: Snapshot = { id, sessionId, createdAt: Date.now(), data }
        fs.writeFileSync(snapshotPath(sessionId, id), JSON.stringify(snapshot, null, 2), "utf-8")
        log.info("snapshot created", { sessionId, snapshotId: id })
        return id
      }),

    restore: (sessionId, snapshotId) =>
      Effect.sync(() => {
        const fp = snapshotPath(sessionId, snapshotId)
        try {
          const content = fs.readFileSync(fp, "utf-8")
          const snapshot = JSON.parse(content) as Snapshot
          return snapshot.data
        } catch (e) {
          log.warn("failed to restore snapshot", { sessionId, snapshotId, error: String(e) })
          return null
        }
      }),

    list: (sessionId) =>
      Effect.sync(() => {
        const dir = snapshotDir(sessionId)
        try {
          const files = fs.readdirSync(dir)
          const snapshots: Snapshot[] = []
          for (const file of files) {
            if (!file.endsWith(".json")) continue
            try {
              const content = fs.readFileSync(path.join(dir, file), "utf-8")
              snapshots.push(JSON.parse(content) as Snapshot)
            } catch {
              // skip corrupt files
            }
          }
          return snapshots.sort((a, b) => b.createdAt - a.createdAt)
        } catch {
          return []
        }
      }),

    remove: (sessionId, snapshotId) =>
      Effect.sync(() => {
        const fp = snapshotPath(sessionId, snapshotId)
        try {
          fs.unlinkSync(fp)
        } catch (e) {
          log.warn("failed to remove snapshot", { sessionId, snapshotId, error: String(e) })
        }
      }),
  }
}

// ── Layer ───────────────────────────────────────────────────

export const SnapshotLive = Layer.succeed(SnapshotService, makeSnapshot())

export * as Snapshot from "."

import { afterEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"
import { ensureSessionSchema } from "../src/session/db"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("ensureSessionSchema", () => {
  it("adds permission_rules_json to an existing session table", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "miniopencode-session-test-"))
    tempDirs.push(dir)

    const dbPath = path.join(dir, "miniopencode.db")
    const db = new Database(dbPath)

    db.run(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'idle',
        title TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        agent_id TEXT DEFAULT 'default',
        model_id TEXT,
        metadata_json TEXT
      )
    `)

    ensureSessionSchema(db)

    const columns = db.query("PRAGMA table_info(session)").all() as Array<{ name: string }>
    expect(columns.some((column) => column.name === "permission_rules_json")).toBe(true)

    db.close()
  })
})

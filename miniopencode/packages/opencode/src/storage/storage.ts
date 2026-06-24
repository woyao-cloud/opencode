// ── Storage Service ──────────────────────────────────────────
// JSON-file-based key-value storage abstraction.
// Data is stored as JSON files organized by prefix/key paths.
// Similar to the full opencode storage but simplified for miniopencode.

import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { Global } from "@miniopencode/core/global"
import fs from "fs"
import path from "path"

const log = Log.create({ service: "storage" })

// ── Errors ──────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError"
  constructor(message: string) {
    super(message)
    this.name = "NotFoundError"
  }

  static isInstance(input: unknown): input is NotFoundError {
    return input instanceof NotFoundError
  }
}

// ── Service Shape ───────────────────────────────────────────

export interface StorageShape {
  /** Read a JSON value at the given key path. */
  readonly read: <T>(key: string[]) => Effect.Effect<T, NotFoundError>
  /** Write a JSON value at the given key path. */
  readonly write: <T>(key: string[], value: T) => Effect.Effect<void>
  /** Remove the file at the given key path. */
  readonly remove: (key: string[]) => Effect.Effect<void>
  /** List all keys under the given prefix. */
  readonly list: (prefix: string[]) => Effect.Effect<string[][]>
  /** Update a JSON value in-place using a mutation function. */
  readonly update: <T>(key: string[], fn: (draft: T) => void) => Effect.Effect<T, NotFoundError>
}

export class StorageService extends Context.Service<StorageService, StorageShape>()("@miniopencode/Storage") {}

// ── Helpers ─────────────────────────────────────────────────

function filePath(key: string[]): string {
  const base = path.join(Global.Path.state, "storage")
  return path.join(base, ...key) + ".json"
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  if ("code" in err && (err as any).code === "ENOENT") return true
  return false
}

function ensureDir(fp: string): void {
  const dir = path.dirname(fp)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// ── Factory ─────────────────────────────────────────────────

export function makeStorage(): StorageShape {
  const root = path.join(Global.Path.state, "storage")
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }

  return {
    read: <T>(key: string[]): Effect.Effect<T, NotFoundError> =>
      Effect.sync(() => {
        const fp = filePath(key)
        try {
          const content = fs.readFileSync(fp, "utf-8")
          return JSON.parse(content) as T
        } catch (e) {
          if (isNotFound(e)) {
            throw new NotFoundError(`Resource not found: ${key.join("/")}`)
          }
          throw e
        }
      }).pipe(
        Effect.catchAll((e) =>
          e instanceof NotFoundError
            ? Effect.fail(e)
            : Effect.die(e),
        ),
      ),

    write: <T>(key: string[], value: T): Effect.Effect<void> =>
      Effect.sync(() => {
        const fp = filePath(key)
        ensureDir(fp)
        fs.writeFileSync(fp, JSON.stringify(value, null, 2), "utf-8")
      }),

    remove: (key: string[]): Effect.Effect<void> =>
      Effect.sync(() => {
        const fp = filePath(key)
        try {
          fs.unlinkSync(fp)
        } catch (e) {
          if (!isNotFound(e)) throw e
        }
      }),

    list: (prefix: string[]): Effect.Effect<string[][]> =>
      Effect.sync(() => {
        const dir = path.join(root, ...prefix)
        try {
          const entries = fs.readdirSync(dir, { recursive: true }) as string[]
          return entries
            .filter((entry) => entry.endsWith(".json"))
            .map((entry) => {
              const rel = entry.slice(0, -5) // remove .json
              return [...prefix, ...rel.split(/[\\/]/)]
            })
            .sort((a, b) => a.join("/").localeCompare(b.join("/")))
        } catch {
          return []
        }
      }),

    update: <T>(key: string[], fn: (draft: T) => void): Effect.Effect<T, NotFoundError> =>
      Effect.sync(() => {
        const fp = filePath(key)
        try {
          const content = fs.readFileSync(fp, "utf-8")
          const data = JSON.parse(content) as T
          fn(data)
          fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf-8")
          return data
        } catch (e) {
          if (isNotFound(e)) {
            throw new NotFoundError(`Resource not found: ${key.join("/")}`)
          }
          throw e
        }
      }).pipe(
        Effect.catchAll((e) =>
          e instanceof NotFoundError
            ? Effect.fail(e)
            : Effect.die(e),
        ),
      ),
  }
}

// ── Layer ───────────────────────────────────────────────────

export const StorageLive = Layer.succeed(StorageService, makeStorage())

export * as Storage from "./storage"

// ── Reference Service ─────────────────────────────────────
// Manage external code references (local paths and git repos).

import { Effect, Context, Layer } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "reference" })

// ── Types ─────────────────────────────────────────────────

export type ResolvedReference =
  | { name: string; kind: "local"; path: string; exists: boolean }
  | { name: string; kind: "git"; repository: string; path: string; branch?: string; resolved: boolean }
  | { name: string; kind: "invalid"; repository?: string; message: string }

export interface ReferenceEntry {
  path?: string
  repository?: string
  branch?: string
}

// ── Service Shape ─────────────────────────────────────────

export interface ReferenceShape {
  readonly resolve: (name: string, entry: ReferenceEntry, baseDir: string) => ResolvedReference
  readonly list: () => Effect.Effect<ResolvedReference[]>
  readonly get: (name: string) => Effect.Effect<ResolvedReference | undefined>
  readonly ensure: (name: string, entry: ReferenceEntry, baseDir: string) => Effect.Effect<ResolvedReference, Error>
}

export class ReferenceService extends Context.Service<ReferenceService, ReferenceShape>()("@miniopencode/Reference") {}

// ── Resolver ──────────────────────────────────────────────

function resolveLocal(name: string, refPath: string, baseDir: string): ResolvedReference {
  const absPath = path.isAbsolute(refPath) ? refPath : path.resolve(baseDir, refPath)
  const exists = fs.existsSync(absPath)
  return { name, kind: "local", path: absPath, exists }
}

function resolveGitRef(name: string, repository: string, branch?: string): ResolvedReference {
  const cacheDir = path.join(process.cwd(), ".opencode", "refs", name.replace(/[^a-zA-Z0-9_-]/g, "_"))
  return { name, kind: "git", repository, path: cacheDir, branch, resolved: fs.existsSync(path.join(cacheDir, ".git")) }
}

function resolveEntry(name: string, entry: ReferenceEntry, baseDir: string): ResolvedReference {
  if (entry.path) return resolveLocal(name, entry.path, baseDir)
  if (entry.repository) return resolveGitRef(name, entry.repository, entry.branch)
  return { name, kind: "invalid", message: "Reference entry must have path or repository" }
}

// ── Git clone helper ──────────────────────────────────────

function gitClone(repository: string, targetDir: string, branch?: string): void {
  const args = ["clone", "--depth", "1"]
  if (branch) args.push("--branch", branch)
  args.push("--", repository, targetDir)
  execSync("git " + args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" "), { stdio: "pipe" })
}

function gitFetch(targetDir: string): void {
  execSync("git fetch --all --prune", { cwd: targetDir, stdio: "pipe" })
}

// ── Factory ───────────────────────────────────────────────

const _refs = new Map<string, ResolvedReference>()

export const makeReferenceService = (): ReferenceShape => ({
  resolve: resolveEntry,

  list: () => Effect.sync(() => Array.from(_refs.values())),

  get: (name) => Effect.sync(() => _refs.get(name)),

  ensure: (name, entry, baseDir): Effect.Effect<ResolvedReference, Error> =>
    Effect.try({
      try: () => {
        const resolved = resolveEntry(name, entry, baseDir)

        if (resolved.kind === "invalid") return resolved

        if (resolved.kind === "local") {
          if (!resolved.exists) {
            log.warn(`Local reference not found: ${resolved.path}`)
          }
          _refs.set(name, resolved)
          return resolved
        }

        // git reference — clone or update
        const gitPath = resolved.path
        const hasGit = fs.existsSync(path.join(gitPath, ".git"))

        if (!hasGit) {
          if (!fs.existsSync(path.dirname(gitPath))) {
            fs.mkdirSync(path.dirname(gitPath), { recursive: true })
          }
          log.info(`Cloning ${resolved.repository} → ${gitPath}`)
          gitClone(resolved.repository, gitPath, resolved.branch)
        } else {
          log.info(`Fetching updates for ${resolved.repository}`)
          gitFetch(gitPath)
          if (resolved.branch) {
            execSync(`git checkout -B ${resolved.branch} origin/${resolved.branch}`, { cwd: gitPath, stdio: "pipe" })
            execSync("git reset --hard HEAD", { cwd: gitPath, stdio: "pipe" })
          }
        }

        const updated: ResolvedReference = {
          ...resolved,
          resolved: true,
        }
        _refs.set(name, updated)
        return updated
      },
      catch: (err) => new Error(`Failed to ensure reference '${name}': ${err}`),
    }),
})

// ── Layer ─────────────────────────────────────────────────

export const ReferenceLive = Layer.succeed(ReferenceService, makeReferenceService())

export * as Reference from "."

import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import path from "path"
import { mkdirSync } from "fs"
import type { Plan } from "./plan"

const log = Log.create({ service: "pipeline.builder" })

export interface BuildResult {
  name: string
  files: Array<{ path: string; bytes: number; status: "written" | "skipped" | "failed"; error?: string }>
  totalBytes: number
  totalFiles: number
  failedFiles: number
}

export function build(plan: Plan, baseDir?: string): Effect.Effect<BuildResult, Error> {
  return Effect.gen(function* () {
    const dir = baseDir ?? process.cwd()
    log.info("building", { name: plan.name, files: plan.files.length, baseDir: dir })

    const results: BuildResult["files"] = []
    let totalBytes = 0
    let failedFiles = 0

    // Build a dep map for ordering
    const depMap = new Map<string, readonly string[]>()
    for (const f of plan.files) {
      depMap.set(f.path, f.deps ?? [])
    }

    // Topological sort: files with no deps first, then files whose deps are all written
    const written = new Set<string>()
    const remaining = new Set(plan.files.map((f) => f.path))

    while (remaining.size > 0) {
      const batch: string[] = []

      for (const filePath of remaining) {
        const deps = depMap.get(filePath) ?? []
        const allDepsWritten = deps.every((d) => written.has(d))
        if (allDepsWritten) {
          batch.push(filePath)
        }
      }

      if (batch.length === 0) {
        // Circular dependency or missing deps — write remaining anyway
        for (const filePath of remaining) batch.push(filePath)
      }

      // Write all files in this batch in parallel
      const batchResults = yield* Effect.all(
        batch.map((filePath) => {
          const file = plan.files.find((f) => f.path === filePath)!
          return writeFile(dir, file.path, file.content).pipe(
            Effect.map((bytes) => ({ path: file.path, bytes, status: "written" as const })),
            Effect.catchEager((e) =>
              Effect.succeed({
                path: file.path,
                bytes: 0,
                status: "failed" as const,
                error: e.message,
              })
            ),
          )
        }),
        { concurrency: batch.length },
      )

      for (const r of batchResults as Array<{ path: string; bytes: number; status: "written" | "failed" | "skipped"; error?: string }>) {
        written.add(r.path)
        remaining.delete(r.path)
        totalBytes += r.bytes
        if (r.status === "failed") failedFiles++
        results.push(r)
      }
    }

    log.info("build complete", { totalFiles: results.length, totalBytes, failedFiles })
    return {
      name: plan.name,
      files: results,
      totalBytes,
      totalFiles: results.length,
      failedFiles,
    }
  })
}

function writeFile(baseDir: string, filePath: string, content: string): Effect.Effect<number, Error> {
  return Effect.gen(function* () {
    const absPath = path.resolve(baseDir, filePath)
    const dir = path.dirname(absPath)

    yield* Effect.try({
      try: () => mkdirSync(dir, { recursive: true }),
      catch: (e) => new Error(`Failed to create directory ${dir}: ${e instanceof Error ? e.message : String(e)}`),
    })

    yield* Effect.tryPromise({
      try: async () => {
        await Bun.write(absPath, content)
      },
      catch: (e) => new Error(`Failed to write ${filePath}: ${e instanceof Error ? e.message : String(e)}`),
    })

    log.info("wrote", { path: filePath, bytes: content.length })
    return content.length
  })
}

export * as Builder from "./builder"

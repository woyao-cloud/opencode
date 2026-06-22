import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { glob } from "glob"
const log = Log.create({ service: "file" })
export function read(filePath: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () { log.debug("read", { path: filePath }); return yield* Effect.tryPromise({ try: async () => Bun.file(filePath).text(), catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export function write(filePath: string, content: string): Effect.Effect<void, Error> {
  return Effect.gen(function* () { log.debug("write", { path: filePath }); yield* Effect.tryPromise({ try: async () => { await Bun.write(filePath, content) }, catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export function exists(filePath: string): Effect.Effect<boolean, never> {
  return Effect.gen(function* () { return yield* Effect.tryPromise({ try: async () => Bun.file(filePath).exists(), catch: () => false }).pipe(Effect.catch(() => Effect.succeed(false))) })
}
export function scan(pattern: string, options?: { cwd?: string }): Effect.Effect<ReadonlyArray<string>, Error> {
  return Effect.gen(function* () { log.debug("scan", { pattern }); return yield* Effect.tryPromise({ try: async () => glob(pattern, { cwd: options?.cwd ?? process.cwd(), absolute: true }), catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export * as File from "./index"

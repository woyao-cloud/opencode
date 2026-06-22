import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "git" })
function git(args: string[], cwd?: string): Effect.Effect<string, Error> {
  return Effect.gen(function* () { log.debug("git", { args }); return yield* Effect.tryPromise({ try: async () => { const proc = Bun.spawn(["git", ...args], { cwd: cwd ?? process.cwd(), stdout: "pipe", stderr: "pipe" }); const exitCode = await proc.exited; const stdout = await new Response(proc.stdout).text(); const stderr = await new Response(proc.stderr).text(); if (exitCode !== 0) throw new Error("git " + args.join(" ") + " failed: " + stderr); return stdout.trim() }, catch: (e) => e instanceof Error ? e : new Error(String(e)) }) })
}
export function branch(cwd?: string) { return git(["branch", "--show-current"], cwd) }
export function status(cwd?: string) { return git(["status", "--short"], cwd) }
export function diff(cwd?: string) { return git(["diff"], cwd) }
export function root(cwd?: string) { return git(["rev-parse", "--show-toplevel"], cwd) }
export * as Git from "./index"

import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"

const log = Log.create({ service: "worktree" })

function git(args: string[], cwd?: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(["git", ...args], {
        cwd: cwd ?? process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      })

      const exitCode = await proc.exited
      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()

      if (exitCode !== 0)
        throw new Error("git " + args.join(" ") + " failed: " + stderr)

      return stdout.trim()
    },
    catch: (e) => (e instanceof Error ? e : new Error(String(e))),
  })
}

export function create(
  branch: string,
  path: string,
  cwd?: string,
): Effect.Effect<string, Error> {
  log.info("create", { branch, path })
  return git(["worktree", "add", path, branch], cwd)
}

export function list(
  cwd?: string,
): Effect.Effect<ReadonlyArray<{ path: string; branch: string }>, Error> {
  log.info("list")
  return Effect.gen(function* () {
    const out = yield* git(["worktree", "list", "--porcelain"], cwd)
    return out
      .split("\n")
      .filter((l) => l.startsWith("worktree "))
      .map((l) => ({ path: l.slice(9), branch: "" }))
  })
}

export function remove(
  path: string,
  cwd?: string,
): Effect.Effect<void, Error> {
  log.info("remove", { path })
  return Effect.gen(function* () {
    yield* git(["worktree", "remove", path], cwd)
  })
}

export * as Worktree from "./index"

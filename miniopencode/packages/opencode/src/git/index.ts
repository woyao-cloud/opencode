import { Effect, Context, Layer } from "effect"

export interface GitShape {
  readonly status: () => Effect.Effect<string, Error>
  readonly diff: () => Effect.Effect<string, Error>
  readonly log: (count?: number) => Effect.Effect<string, Error>
}

export class GitService extends Context.Service<GitService, GitShape>()("@miniopencode/Git") {}

export const GitLive: Layer.Layer<GitService> = Layer.succeed(GitService, {
  status: () =>
    Effect.tryPromise({
      try: async () => {
        const { execSync } = await import("child_process")
        return execSync("git status", { encoding: "utf-8" })
      },
      catch: (e) => e instanceof Error ? e : new Error(String(e)),
    }),
  diff: () =>
    Effect.tryPromise({
      try: async () => {
        const { execSync } = await import("child_process")
        return execSync("git diff", { encoding: "utf-8" })
      },
      catch: (e) => e instanceof Error ? e : new Error(String(e)),
    }),
  log: (count = 10) =>
    Effect.tryPromise({
      try: async () => {
        const { execSync } = await import("child_process")
        return execSync(`git log --oneline -${count}`, { encoding: "utf-8" })
      },
      catch: (e) => e instanceof Error ? e : new Error(String(e)),
    }),
})

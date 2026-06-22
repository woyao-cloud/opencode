import { Effect, Schema } from "effect"
import * as Tool from "./tool"
const Parameters = Schema.Struct({ command: Schema.String.annotate({ description: "Shell command to execute" }), cwd: Schema.optional(Schema.String).annotate({ description: "Working directory" }) })
export const BashTool = Tool.define("bash", Effect.gen(function* () {
  return {
    description: "Execute a shell command and return stdout/stderr.",
    parameters: Parameters,
    execute: (args: any) => Effect.gen(function* () {
      const proc = Bun.spawn(["sh", "-c", args.command], { cwd: args.cwd ?? process.cwd(), stdout: "pipe", stderr: "pipe" })
      const exitCode = yield* Effect.tryPromise({ try: async () => proc.exited, catch: (e) => e instanceof Error ? e : new Error(String(e)) })
      const stdout = yield* Effect.tryPromise({ try: async () => new Response(proc.stdout).text(), catch: (e) => e instanceof Error ? e : new Error(String(e)) })
      const stderr = yield* Effect.tryPromise({ try: async () => new Response(proc.stderr).text(), catch: (e) => e instanceof Error ? e : new Error(String(e)) })
      const output = exitCode === 0 ? stdout : "exit=" + exitCode + "\nstdout=" + stdout + "\nstderr=" + stderr
      return { title: args.command.slice(0, 60), output, metadata: { exitCode, command: args.command } }
    }),
  }
}))
export * as Bash from "./bash"

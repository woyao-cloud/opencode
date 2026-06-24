import { Effect, Schema } from "effect"
import { execSync } from "child_process"
import * as Tool from "./tool"
import { truncateOutput } from "./truncate"

export const Parameters = Schema.Struct({
  command: Schema.String.annotate({ description: "The shell command to execute" }),
  workdir: Schema.optional(Schema.String).annotate({
    description: "Working directory for the command (default: current directory)",
  }),
  timeout: Schema.optional(Schema.Number).annotate({
    description: "Timeout in milliseconds (default: 30000)",
  }),
})

export const BashTool = Tool.define(
  "bash",
  Effect.succeed({
    description:
      "Execute a shell command and return the output. Use this for running scripts, compiling, testing, and other shell operations.",
    parameters: Parameters,
    execute: (params: { command: string; workdir?: string; timeout?: number }, _ctx: Tool.ToolContext) =>
      Effect.gen(function* () {
        const workdir = params.workdir ?? process.cwd()
        const timeout = params.timeout ?? 30000

        try {
          const output = execSync(params.command, {
            cwd: workdir,
            encoding: "utf-8",
            timeout,
            maxBuffer: 10 * 1024 * 1024,
          })
          const result = output || "(no output)"
          return { title: params.command, output: truncateOutput(`$ ${params.command}\n${result}`, 10000) }
        } catch (e: any) {
          const stderr = e.stderr ? `\n${e.stderr}` : ""
          const stdout = e.stdout ? `\n${e.stdout}` : ""
          const message = `Command failed (exit code ${e.status ?? "?"}): ${params.command}${stdout}${stderr}`
          return { title: "Error", output: truncateOutput(message, 10000) }
        }
      }),
  }),
)

import { Effect, Schema } from "effect"
import fs from "fs"
import * as Tool from "./tool"
import { truncateOutput } from "./truncate"

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file or directory to read" }),
  offset: Schema.optional(Schema.Number).annotate({
    description: "The line number to start reading from (1-indexed)",
  }),
  limit: Schema.optional(Schema.Number).annotate({
    description: "The maximum number of lines to read (defaults to 2000)",
  }),
})

export const ReadTool = Tool.define(
  "read",
  Effect.succeed({
    description: "Read a file from the filesystem. Returns file contents with line numbers.",
    parameters: Parameters,
    execute: (params: { filePath: string; offset?: number; limit?: number }, _ctx: Tool.ToolContext) =>
      Effect.gen(function* () {
        const offset = params.offset ?? 1
        const limit = params.limit ?? 2000

        if (!fs.existsSync(params.filePath)) {
          return { title: "Error", output: `Error: File not found: ${params.filePath}` }
        }

        const stat = fs.statSync(params.filePath)
        if (stat.isDirectory()) {
          return { title: "Error", output: `Error: Path is a directory: ${params.filePath}` }
        }

        try {
          const content = fs.readFileSync(params.filePath, "utf-8")
          const lines = content.split("\n")

          const startIdx = Math.max(0, offset - 1)
          const endIdx = Math.min(lines.length, startIdx + limit)
          const selected = lines.slice(startIdx, endIdx)

          const numbered = selected.map((line, i) => `${startIdx + i + 1}: ${line}`).join("\n")
          const summary = `File: ${params.filePath} (${lines.length} lines, showing ${startIdx + 1}-${endIdx})\n\n${numbered}`

          return { title: params.filePath, output: truncateOutput(summary, 50000) }
        } catch (e) {
          return {
            title: "Error",
            output: `Error reading file ${params.filePath}: ${e instanceof Error ? e.message : String(e)}`,
          }
        }
      }),
  }),
)

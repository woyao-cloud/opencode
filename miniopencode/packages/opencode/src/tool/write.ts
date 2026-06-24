import { Effect, Schema } from "effect"
import fs from "fs"
import path from "path"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  filePath: Schema.String.annotate({ description: "The absolute path to the file to write" }),
  content: Schema.String.annotate({ description: "Content to write to the file" }),
})

export const WriteTool = Tool.define(
  "write",
  Effect.succeed({
    description: "Write content to a file. Creates parent directories if they don't exist.",
    parameters: Parameters,
    execute: (params: { filePath: string; content: string }, _ctx: Tool.ToolContext) =>
      Effect.gen(function* () {
        try {
          const dir = path.dirname(params.filePath)
          if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
          }
          fs.writeFileSync(params.filePath, params.content, "utf-8")
          return {
            title: params.filePath,
            output: `Successfully wrote ${Buffer.byteLength(params.content, "utf-8")} bytes to ${params.filePath}`,
          }
        } catch (e) {
          return {
            title: "Error",
            output: `Error writing file ${params.filePath}: ${e instanceof Error ? e.message : String(e)}`,
          }
        }
      }),
  }),
)

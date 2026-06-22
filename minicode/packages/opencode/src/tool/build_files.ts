import { Effect, Schema } from "effect"
import path from "path"
import * as Tool from "./tool"
import { File } from "@/file"

const FileSpec = Schema.Struct({
  path: Schema.String.annotate({ description: "Relative file path (e.g. src/game.py)" }),
  content: Schema.String.annotate({ description: "File content to write" }),
})

const Parameters = Schema.Struct({
  files: Schema.Array(FileSpec).annotate({ description: "List of files to create/overwrite" }),
  baseDir: Schema.optional(Schema.String).annotate({ description: "Base directory for relative paths (defaults to cwd)" }),
})

export const BuildFilesTool = Tool.define(
  "build_files",
  Effect.gen(function* () {
    return {
      description: "Write multiple files in a single tool call. Creates parent directories automatically. Use this tool when you need to create or update several files at once, especially for generating multi-file projects.",
      parameters: Parameters,
      execute: (args: any) =>
        Effect.gen(function* () {
          const baseDir = args.baseDir ?? process.cwd()
          const results: { path: string; bytes: number }[] = []
          let totalBytes = 0

          for (const file of args.files) {
            const filePath = path.resolve(baseDir, file.path)
            const dir = path.dirname(filePath)
            yield* Effect.tryPromise({
              try: async () => {
                await Bun.write(Bun.file(filePath), file.content)
              },
              catch: (e) => (e instanceof Error ? e : new Error(String(e))),
            })
            results.push({ path: file.path, bytes: file.content.length })
            totalBytes += file.content.length
          }

          const summary = results.map((r) => `  ${r.path} (${r.bytes} bytes)`).join("\n")
          return {
            title: `build_files: ${args.files.length} files`,
            output: `Wrote ${args.files.length} files (${totalBytes} total bytes):\n${summary}`,
            metadata: { count: args.files.length, totalBytes, files: results },
          }
        }),
    }
  }),
)

export * as BuildFiles from "./build_files"

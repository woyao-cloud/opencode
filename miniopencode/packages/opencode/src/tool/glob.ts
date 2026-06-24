import { Effect, Schema } from "effect"
import { globSync } from "glob"
import * as Tool from "./tool"
import { truncateOutput } from "./truncate"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "Glob pattern to search for (e.g., '**/*.ts', 'src/**/*.css')" }),
  path: Schema.optional(Schema.String).annotate({
    description:
      'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. Must be a valid directory path if provided.',
  }),
})

export const GlobTool = Tool.define(
  "glob",
  Effect.succeed({
    description:
      "Find files and directories matching a glob pattern. Uses gitignore-style patterns.",
    parameters: Parameters,
    execute: (params: { pattern: string; path?: string }, _ctx: Tool.ToolContext) =>
      Effect.gen(function* () {
        const searchPath = params.path ?? process.cwd()

        try {
          const results = globSync(params.pattern, { cwd: searchPath, dot: true, nodir: false })
          if (results.length === 0) {
            return { title: params.pattern, output: `No files found matching pattern: ${params.pattern}` }
          }
          const list = results.map((f) => `  ${f}`).join("\n")
          return {
            title: params.pattern,
            output: truncateOutput(`Found ${results.length} file(s) matching: ${params.pattern}\n${list}`, 10000),
          }
        } catch (e) {
          return {
            title: "Error",
            output: `Error searching for pattern ${params.pattern}: ${e instanceof Error ? e.message : String(e)}`,
          }
        }
      }),
  }),
)

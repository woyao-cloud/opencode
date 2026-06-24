import { Effect, Schema } from "effect"
import { execSync } from "child_process"
import * as Tool from "./tool"
import { truncateOutput } from "./truncate"

export const Parameters = Schema.Struct({
  pattern: Schema.String.annotate({ description: "Regular expression pattern to search for" }),
  include: Schema.optional(Schema.String).annotate({
    description: 'File pattern to include in the search (e.g. "*.ts", "*.{ts,tsx}")',
  }),
  path: Schema.optional(Schema.String).annotate({
    description: "Directory to search in (default: current directory)",
  }),
  maxResults: Schema.optional(Schema.Number).annotate({
    description: "Maximum number of results to return (default: 100)",
  }),
})

export const GrepTool = Tool.define(
  "grep",
  Effect.succeed({
    description:
      "Search file contents using regular expressions. Uses ripgrep (rg) if available, otherwise falls back to grep-like search.",
    parameters: Parameters,
    execute: (
      params: { pattern: string; include?: string; path?: string; maxResults?: number },
      _ctx: Tool.ToolContext,
    ) =>
      Effect.gen(function* () {
        const searchPath = params.path ?? process.cwd()
        const include = params.include
        const maxResults = params.maxResults ?? 100

        try {
          const includeArg = include ? `--include '${include}'` : ""
          const cmd = `rg --no-heading -n "${params.pattern}" ${includeArg} "${searchPath}" 2>nul || findstr /sn /r "${params.pattern}" "${searchPath}\\*${include ? `.${include.split('.').pop()}` : '.ts'}" 2>nul`

          const output = execSync(cmd, { encoding: "utf-8", timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
          const lines = output.trim().split("\n").filter(Boolean)

          if (lines.length === 0) {
            return { title: params.pattern, output: `No matches found for pattern: ${params.pattern}` }
          }

          const shown = lines.slice(0, maxResults)
          const list = shown.map((l) => `  ${l}`).join("\n")
          const summary = `Found ${lines.length} match(es) for: ${params.pattern}\n${list}`
          if (lines.length > maxResults) {
            return {
              title: params.pattern,
              output: truncateOutput(summary + `\n... and ${lines.length - maxResults} more`, 10000),
            }
          }
          return { title: params.pattern, output: truncateOutput(summary, 10000) }
        } catch (e) {
          return {
            title: "Error",
            output: `Error searching for pattern ${params.pattern}: ${e instanceof Error ? e.message : String(e)}`,
          }
        }
      }),
  }),
)

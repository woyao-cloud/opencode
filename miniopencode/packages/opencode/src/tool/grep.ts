import { execSync } from "child_process"
import type { Tool } from "./tool"
import { truncateOutput } from "./truncate"
import { toolSchema } from "./json-schema"

export const GrepTool: Tool = {
  name: "grep",
  description: "Search file contents using regular expressions. Uses ripgrep (rg) if available, otherwise falls back to grep-like search.",
  parameters: toolSchema({
    pattern: { type: "string", description: "Regular expression pattern to search for" },
    include: { type: "string", description: "File pattern to filter (e.g., '*.ts', '*.{ts,tsx}')" },
    path: { type: "string", description: "Directory to search in (default: current directory)", default: "." },
    maxResults: { type: "number", description: "Maximum number of results to return", default: 100 },
  }),
  execute: async (args: Record<string, unknown>) => {
    const pattern = args.pattern as string
    const searchPath = (args.path as string) ?? process.cwd()
    const include = args.include as string | undefined
    const maxResults = (args.maxResults as number) ?? 100

    try {
      // Try ripgrep first, fallback to findstr on Windows
      const includeArg = include ? `--include '${include}'` : ""
      const cmd = `rg --no-heading -n "${pattern}" ${includeArg} "${searchPath}" 2>nul || findstr /sn /r "${pattern}" "${searchPath}\\*${include ? `.${include.split('.').pop()}` : '.ts'}" 2>nul`
      
      const output = execSync(cmd, { encoding: "utf-8", timeout: 10000, maxBuffer: 5 * 1024 * 1024 })
      const lines = output.trim().split("\n").filter(Boolean)
      
      if (lines.length === 0) {
        return `No matches found for pattern: ${pattern}`
      }

      const shown = lines.slice(0, maxResults)
      const list = shown.map((l) => `  ${l}`).join("\n")
      const summary = `Found ${lines.length} match(es) for: ${pattern}\n${list}`
      if (lines.length > maxResults) {
        return truncateOutput(summary + `\n... and ${lines.length - maxResults} more`, 10000)
      }
      return truncateOutput(summary, 10000)
    } catch (e) {
      return `Error searching for pattern ${pattern}: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

import { globSync } from "glob"
import type { Tool } from "./tool"
import { truncateOutput } from "./truncate"

export const GlobTool: Tool = {
  name: "glob",
  description: "Find files and directories matching a glob pattern. Uses gitignore-style patterns.",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern to search for (e.g., '**/*.ts', 'src/**/*.css')" },
      path: { type: "string", description: "Directory to search in (default: current directory)", default: "." },
    },
    required: ["pattern"],
  },
  execute: async (args: Record<string, unknown>) => {
    const pattern = args.pattern as string
    const searchPath = (args.path as string) ?? process.cwd()

    try {
      const results = globSync(pattern, { cwd: searchPath, dot: true, nodir: false })
      if (results.length === 0) {
        return `No files found matching pattern: ${pattern}`
      }
      const list = results.map((f) => `  ${f}`).join("\n")
      return truncateOutput(`Found ${results.length} file(s) matching: ${pattern}\n${list}`, 10000)
    } catch (e) {
      return `Error searching for pattern ${pattern}: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

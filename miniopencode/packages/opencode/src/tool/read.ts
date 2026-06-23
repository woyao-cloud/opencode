import fs from "fs"
import type { Tool } from "./tool"
import { truncateOutput } from "./truncate"

export const ReadTool: Tool = {
  name: "read",
  description: "Read a file from the filesystem. Returns file contents with line numbers.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file to read" },
      offset: { type: "number", description: "Line number to start from (1-indexed)", default: 1 },
      limit: { type: "number", description: "Maximum number of lines to read", default: 2000 },
    },
    required: ["path"],
  },
  execute: async (args: Record<string, unknown>) => {
    const filePath = args.path as string
    const offset = (args.offset as number) ?? 1
    const limit = (args.limit as number) ?? 2000

    if (!fs.existsSync(filePath)) {
      return `Error: File not found: ${filePath}`
    }

    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      return `Error: Path is a directory: ${filePath}`
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8")
      const lines = content.split("\n")

      const startIdx = Math.max(0, offset - 1)
      const endIdx = Math.min(lines.length, startIdx + limit)
      const selected = lines.slice(startIdx, endIdx)

      const numbered = selected.map((line, i) => `${startIdx + i + 1}: ${line}`).join("\n")
      const summary = `File: ${filePath} (${lines.length} lines, showing ${startIdx + 1}-${endIdx})\n\n${numbered}`

      return truncateOutput(summary, 50000)
    } catch (e) {
      return `Error reading file ${filePath}: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

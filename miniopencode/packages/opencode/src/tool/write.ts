import fs from "fs"
import path from "path"
import type { Tool } from "./tool"
import { toolSchema } from "./json-schema"

export const WriteTool: Tool = {
  name: "write",
  description: "Write content to a file. Creates parent directories if they don't exist.",
  parameters: toolSchema({
    path: { type: "string", description: "Path to the file to write" },
    content: { type: "string", description: "Content to write to the file" },
  }),
  execute: async (args: Record<string, unknown>) => {
    const filePath = args.path as string
    const content = args.content as string

    try {
      const dir = path.dirname(filePath)
      if (dir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(filePath, content, "utf-8")
      return `Successfully wrote ${Buffer.byteLength(content, "utf-8")} bytes to ${filePath}`
    } catch (e) {
      return `Error writing file ${filePath}: ${e instanceof Error ? e.message : String(e)}`
    }
  },
}

import { execSync } from "child_process"
import type { Tool } from "./tool"
import { truncateOutput } from "./truncate"
import { toolSchema } from "./json-schema"

export const BashTool: Tool = {
  name: "bash",
  description: "Execute a shell command and return the output. Use this for running scripts, compiling, testing, and other shell operations.",
  parameters: toolSchema({
    command: { type: "string", description: "The shell command to execute" },
    workdir: { type: "string", description: "Working directory for the command", default: "." },
    timeout: { type: "number", description: "Timeout in milliseconds", default: 30000 },
  }),
  execute: async (args: Record<string, unknown>) => {
    const command = args.command as string
    const workdir = (args.workdir as string) ?? process.cwd()
    const timeout = (args.timeout as number) ?? 30000

    try {
      const output = execSync(command, {
        cwd: workdir,
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      })
      const result = output || "(no output)"
      return truncateOutput(`$ ${command}\n${result}`, 10000)
    } catch (e: any) {
      const stderr = e.stderr ? `\n${e.stderr}` : ""
      const stdout = e.stdout ? `\n${e.stdout}` : ""
      const message = `Command failed (exit code ${e.status ?? "?"}): ${command}${stdout}${stderr}`
      return truncateOutput(message, 10000)
    }
  },
}

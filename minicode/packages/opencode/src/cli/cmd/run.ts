import { mkdirSync } from "fs"
import path from "path"
import { Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { Session } from "@/session/session"
import { Agent } from "@/agent/agent"
import * as Project from "@/project/project"
import { LLM } from "@minicode/llm"
import { OpenAI } from "@minicode/llm/providers"
import { ascendingPartID } from "@/session/schema"
const log = Log.create({ service: "cli.run" })
export async function runCommand(opts: { prompt?: string; interactive?: boolean; model?: string; baseURL?: string; apiKey?: string }) {
  await init()
  if (opts.interactive) { await interactive(opts); return }
  if (!opts.prompt) { console.error("Error: provide --prompt or --interactive"); process.exit(1) }
  await singleShot(opts.prompt, opts)
}
async function singleShot(prompt: string, opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const model = resolveModel(opts)
  await AppRuntime.runPromise(Effect.gen(function* () {
    const project = yield* Project.Service as any
    const session = yield* Session.Service as any
    const agent = yield* Agent.Service as any
    const info = yield* project.current()
    const sess = yield* session.create({ projectID: info.id, directory: info.directory, agent: "build" })
    yield* session.appendMessage({ sessionID: sess.id, role: "user", parts: [{ id: ascendingPartID(), type: "text", text: prompt }] })
    const agentInfo = yield* agent.get("build")
    const system = agentInfo.prompt ?? "You are a helpful assistant."
    const messages = yield* session.messages(sess.id)
    const aiMessages: Array<{ role: string; content: string }> = messages.map((m: any) => ({ role: m.role, content: m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n") }))
    log.info("calling LLM", { messages: aiMessages.length })
    const result = yield* LLM.generate({ model, system, messages: aiMessages as any }) as any
    console.log(result.text)
    yield* session.appendMessage({ sessionID: sess.id, role: "assistant", parts: [{ id: ascendingPartID(), type: "text", text: result.text }] })
  }))
}
async function interactive(opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const model = resolveModel(opts)
  const history: Array<{ role: string; content: string }> = []
  console.log("minicode interactive mode. Type 'exit' to quit.\n")

  // ai-sdk Tool definitions for file/shell operations
  const tools = {
    read: {
      description: "Read the contents of a file, with optional offset and limit.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file" },
          offset: { type: "number", description: "Line number to start from (1-based)" },
          limit: { type: "number", description: "Max lines to read" },
        },
        required: ["path"],
      },
      execute: async ({ path: filePath, offset, limit }: { path: string; offset?: number; limit?: number }) => {
        console.log(`  📖 reading ${filePath}...`)
        const file = Bun.file(filePath)
        const content = await file.text()
        const lines = content.split("\n")
        const start = offset ? offset - 1 : 0
        const end = limit ? start + limit : lines.length
        console.log(`  ✅ read ${end - start} lines`)
        return lines.slice(start, end).join("\n")
      },
    },
    write: {
      description: "Write content to a file. Automatically creates parent directories if they don't exist.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute path to the file to write" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
      execute: async (args: { path?: string; filePath?: string; content: string }) => {
        const fp = args.path ?? args.filePath
        if (!fp) throw new Error("path is required")
        console.log(`  📝 writing ${fp}...`)
        // Auto-create parent directory
        const dir = path.dirname(fp)
        mkdirSync(dir, { recursive: true })
        await Bun.write(fp, args.content)
        const size = args.content.length
        console.log(`  ✅ wrote ${size} bytes to ${fp}`)
        return `Wrote ${size} bytes to ${fp}`
      },
    },
    bash: {
      description: "Execute a shell command and return the output.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          cwd: { type: "string", description: "Working directory (default: current)" },
        },
        required: ["command"],
      },
      execute: async ({ command, cwd }: { command: string; cwd?: string }) => {
        let cmd = command
        const isWin = process.platform === "win32"
        if (isWin) {
          // mkdir -p / --parents → mkdir -Force (idempotent, suppress verbose output)
          cmd = cmd.replace(/\bmkdir\s+(?:--parents|-p)\s+(.+)/g, "mkdir -Force $1 *>`$null")
        }
        console.log(`  🔧 running: ${cmd}`)
        const shell = isWin ? "powershell" : "sh"
        const args = isWin ? ["-NoProfile", "-Command", cmd] : ["-c", cmd]
        const proc = Bun.spawnSync([shell, ...args], { cwd: cwd ?? process.cwd() })
        const stdout = proc.stdout.toString()
        const stderr = proc.stderr.toString()
        const result = stdout || stderr || `Command completed (exit code ${proc.exitCode})`
        console.log(`  ✅ exit code: ${proc.exitCode}`)
        if (proc.exitCode === 0) return result
        return `exit code: ${proc.exitCode}\n${stdout}\n${stderr}`
      },
    },
  } as Record<string, any>

  const readline = await import("readline")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = () => rl.question("> ", async (input) => {
    if (!input || input === "exit") { rl.close(); return }
    history.push({ role: "user", content: input })
    try {
      const result = await AppRuntime.runPromise(LLM.generate({
        model,
        system: "You are a helpful coding assistant with access to read/write files and run shell commands. Use the write tool when you need to create or modify files.",
        messages: history as any,
        tools,
      })) as any
      history.push({ role: "assistant", content: result.text })
      console.log(result.text)
    } catch (e) {
      console.error("Error:", e instanceof Error ? e.message : String(e))
    }
    ask()
  })
  ask()
}
function resolveModel(opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const modelID = opts.model ?? process.env.MINICODE_MODEL ?? "gpt-4o-mini"
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY
  if (opts.baseURL) { return { providerID: "openai-compatible" as any, modelID: modelID as any, apiKey, baseURL: opts.baseURL } }
  return OpenAI.model(modelID, { apiKey })
}

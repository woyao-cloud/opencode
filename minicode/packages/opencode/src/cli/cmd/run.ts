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
  const readline = await import("readline")
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = () => rl.question("> ", async (input) => {
    if (!input || input === "exit") { rl.close(); return }
    history.push({ role: "user", content: input })
    try { const result = await AppRuntime.runPromise(LLM.generate({ model, system: "You are a helpful coding assistant.", messages: history as any })) as any; console.log(result.text); history.push({ role: "assistant", content: result.text }) } catch (e) { console.error("Error:", e instanceof Error ? e.message : String(e)) }
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

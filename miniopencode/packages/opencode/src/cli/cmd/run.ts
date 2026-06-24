import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { LLM } from "@miniopencode/llm"
import { ProviderService } from "@/provider/index"
import type { ResolvedModel } from "@/provider/schema"
import { AgentService } from "@/agent/agent"
import { ToolRuntimeService } from "@/tool/tool"
import { SessionService } from "@/session/session"
import readline from "readline"

const log = Log.create({ service: "cli.run" })

export async function runCommand(opts: { prompt?: string; model?: string; baseURL?: string; apiKey?: string; interactive?: boolean }) {
  await init()

  const tools = await AppRuntime.runPromise(
    ToolRuntimeService.use((svc) => Effect.succeed(svc.toAITools())),
  ) as any

  if (opts.interactive) {
    return runInteractive({ model: opts.model, baseURL: opts.baseURL, apiKey: opts.apiKey, tools })
  }

  if (!opts.prompt) {
    console.error("Error: provide --prompt or use --interactive")
    process.exit(1)
  }

  const prompt = opts.prompt!

  // ── Create session and resolve model ──
  const initResult = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const session = yield* SessionService.use((svc) => svc.create({ title: prompt.slice(0, 100) }))
      yield* SessionService.use((svc) => svc.updateStatus(session.id, "running"))
      const model = yield* ProviderService.use((svc) => svc.resolve(opts.model))
      return { session, model }
    }),
  ) as any

  let model = initResult.model as ResolvedModel
  const session = initResult.session

  // CLI overrides take precedence over config
  if (opts.baseURL) model.baseURL = opts.baseURL
  if (opts.apiKey) model.apiKey = opts.apiKey

  log.info("calling LLM", { model: model.modelID, prompt: prompt.slice(0, 60), session: session.id })

  // ── Persist user message ──
  await AppRuntime.runPromise(
    SessionService.use((svc) => svc.appendMessage(session.id, { role: "user", content: prompt })),
  )

  const agentInfo = await AppRuntime.runPromise(AgentService.use((svc) => svc.defaultAgent())) as any
  const system = agentInfo?.system ?? "You are a helpful assistant."

  const toolCallLog: Array<string> = []

  const result = await AppRuntime.runPromise(
    LLM.generate({
      model,
      system,
      messages: [{ role: "user" as const, content: prompt }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      onToolCall: (name, args) => {
        toolCallLog.push(`⚡ ${name}(${JSON.stringify(args)})`)
      },
      onToolResult: (name, result) => {
        const truncated = result.length > 300 ? result.slice(0, 300) + "..." : result
        toolCallLog.push(`  └─ ${name} -> ${truncated}`)
      },
    }),
  ).catch(async (e: Error) => {
    await AppRuntime.runPromise(SessionService.use((svc) => svc.updateStatus(session.id, "error")))
    console.error("Error:", e.message)
    process.exit(1)
  }) as any

  // ── Persist assistant response and update status ──
  await AppRuntime.runPromise(
    Effect.gen(function* () {
      yield* SessionService.use((svc) => svc.appendMessage(session.id, { role: "assistant", content: result.text }))
      yield* SessionService.use((svc) => svc.updateStatus(session.id, "idle"))
    }),
  )

  if (toolCallLog.length > 0) {
    console.log("\n" + toolCallLog.join("\n"))
  }

  console.log("\n" + result.text)
}

async function runInteractive(opts: { model?: string; baseURL?: string; apiKey?: string; tools: any }) {
  const initResult = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const session = yield* SessionService.use((svc) => svc.create({ title: "interactive session" }))
      yield* SessionService.use((svc) => svc.updateStatus(session.id, "running"))
      const model = yield* ProviderService.use((svc) => svc.resolve(opts.model))
      return { session, model }
    }),
  ) as any

  let model = initResult.model as ResolvedModel
  const session = initResult.session

  if (opts.baseURL) model.baseURL = opts.baseURL
  if (opts.apiKey) model.apiKey = opts.apiKey

  const agentInfo = await AppRuntime.runPromise(AgentService.use((svc) => svc.defaultAgent())) as any
  const system = agentInfo?.system ?? "You are a helpful assistant."

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const messages: Array<{ role: string; content: any }> = []

  const toolCallLog: Array<string> = []

  console.log("\nInteractive mode. Type your messages (or 'exit' to quit).\n")

  const ask = () => {
    rl.question("> ", async (input) => {
      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        rl.close()
        return
      }

      // Persist user message
      await AppRuntime.runPromise(
        SessionService.use((svc) => svc.appendMessage(session.id, { role: "user", content: input })),
      )
      messages.push({ role: "user", content: input })
      toolCallLog.length = 0

      try {
        const result = await AppRuntime.runPromise(
          LLM.generate({
            model,
            system,
            messages: messages as any,
            tools: Object.keys(opts.tools).length > 0 ? opts.tools : undefined,
            onToolCall: (name, args) => {
              toolCallLog.push(`⚡ ${name}(${JSON.stringify(args)})`)
            },
            onToolResult: (name, result) => {
              const truncated = result.length > 300 ? result.slice(0, 300) + "..." : result
              toolCallLog.push(`  └─ ${name} -> ${truncated}`)
            },
          }),
        ) as any

        // Show any tool calls that happened
        if (toolCallLog.length > 0) {
          console.log("\n" + toolCallLog.join("\n"))
        }

        console.log("\n" + result.text + "\n")
        messages.push({ role: "assistant", content: result.text })

        // Persist assistant response
        await AppRuntime.runPromise(
          SessionService.use((svc) => svc.appendMessage(session.id, { role: "assistant", content: result.text })),
        )
      } catch (e: any) {
        console.error("Error:", e.message)
      }

      ask()
    })
  }

  ask()
}

export * as RunCommand from "./run"

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { LLM } from "@miniopencode/llm"
import { OpenAI } from "@miniopencode/llm/providers/openai"
import { AgentService } from "@/agent/agent"
import { ToolRuntimeService } from "@/tool/tool"
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

  const model = resolveModel(opts)
  log.info("calling LLM", { prompt: opts.prompt.slice(0, 60) })

  const agentInfo = await AppRuntime.runPromise(AgentService.use((svc) => svc.defaultAgent())) as any
  const system = agentInfo?.system ?? "You are a helpful assistant."

  const result = await AppRuntime.runPromise(
    LLM.generate({
      model,
      system,
      messages: [{ role: "user" as const, content: opts.prompt }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
    }),
  ).catch((e: Error) => {
    console.error("Error:", e.message)
    process.exit(1)
  }) as any

  console.log(result.text)
}

function resolveModel(opts: { model?: string; baseURL?: string; apiKey?: string }) {
  const modelID = opts.model ?? process.env.MINICODE_MODEL ?? "gpt-4o-mini"
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.MINICODE_API_KEY
  if (opts.baseURL) {
    return { providerID: "openai-compatible" as any, modelID: modelID as any, apiKey, baseURL: opts.baseURL }
  }
  return OpenAI.model(modelID, { apiKey })
}

async function runInteractive(opts: { model?: string; baseURL?: string; apiKey?: string; tools: any }) {
  const model = resolveModel(opts)
  const agentInfo = await AppRuntime.runPromise(AgentService.use((svc) => svc.defaultAgent())) as any
  const system = agentInfo?.system ?? "You are a helpful assistant."

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const messages: Array<{ role: string; content: any }> = []

  console.log("Interactive mode. Type your messages (or 'exit' to quit).")

  const ask = () => {
    rl.question("> ", async (input) => {
      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        rl.close()
        return
      }

      messages.push({ role: "user", content: input })

      try {
        const result = await AppRuntime.runPromise(
          LLM.generate({
            model,
            system,
            messages: messages as any,
            tools: Object.keys(opts.tools).length > 0 ? opts.tools : undefined,
          }),
        ) as any

        console.log("\n" + result.text + "\n")
        messages.push({ role: "assistant", content: result.text })
      } catch (e: any) {
        console.error("Error:", e.message)
      }

      ask()
    })
  }

  ask()
}

export * as RunCommand from "./run"

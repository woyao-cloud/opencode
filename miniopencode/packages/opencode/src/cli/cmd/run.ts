// ── Run Command — CLI entry point for prompt execution ────────

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { ProviderService } from "@/provider/index"
import type { ResolvedModel } from "@/provider/schema"
import { PromptService } from "@/session/prompt"
import { SessionService } from "@/session/session"
import { ToolRuntimeService } from "@/tool/tool"
import readline from "readline"

const log = Log.create({ service: "cli.run" })

export async function runCommand(opts: {
  prompt?: string
  model?: string
  baseURL?: string
  apiKey?: string
  interactive?: boolean
}) {
  await init()

  const tools = await AppRuntime.runPromise(
    ToolRuntimeService.use((svc) => Effect.succeed(svc.toAITools())),
  ) as any

  if (opts.interactive) {
    return runInteractive({ model: opts.model, baseURL: opts.baseURL, apiKey: opts.apiKey, tools: tools as Record<string, unknown> })
  }

  if (!opts.prompt) {
    console.error("Error: provide --prompt or use --interactive")
    process.exit(1)
  }

  const input = opts.prompt!

  // Create session, resolve model, then run through the prompt engine
  const result = await AppRuntime.runPromise(
    Effect.gen(function* () {
      const session = yield* SessionService.use((svc) => svc.create({ title: input.slice(0, 100) }))
      yield* SessionService.use((svc) => svc.updateStatus(session.id, "running"))
      const model = yield* ProviderService.use((svc) => svc.resolve(opts.model))

      let resolvedModel = model as ResolvedModel
      if (opts.baseURL) resolvedModel.baseURL = opts.baseURL
      if (opts.apiKey) resolvedModel.apiKey = opts.apiKey

      log.info("prompt start", {
        model: resolvedModel.modelID,
        prompt: input.slice(0, 60),
        session: session.id,
        tools: Object.keys(tools).length,
      })

      return yield* PromptService.use((svc) =>
        svc.prompt({
          sessionId: session.id,
          userInput: input,
          model: resolvedModel,
          tools,
        })
      )
    }),
  ).catch(async (e: Error) => {
    console.error("Error:", e.message)
    process.exit(1)
  }) as any

  if (result.toolSteps.length > 0) {
    console.log("\n" + result.toolSteps.map((s: any) => `⚡ ${s.name}(${JSON.stringify(s.args)})`).join("\n"))
  }

  console.log("\n" + result.text)
}

async function runInteractive(opts: {
  model?: string
  baseURL?: string
  apiKey?: string
  tools: Record<string, unknown>
}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  // Create a persistent session for the interactive session
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

  console.log("\nInteractive mode. Type your messages (or 'exit' to quit).\n")

  const ask = () => {
    rl.question("> ", async (input) => {
      if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
        rl.close()
        return
      }

      try {
        const result = await AppRuntime.runPromise(
          PromptService.use((svc) =>
            svc.prompt({
              sessionId: session.id,
              userInput: input,
              model,
              tools: opts.tools,
            })
          ),
        ) as any

        if (result.toolSteps.length > 0) {
          console.log("\n" + result.toolSteps.map((s: any) => `⚡ ${s.name}(${JSON.stringify(s.args)})`).join("\n"))
        }

        console.log("\n" + result.text + "\n")
      } catch (e: any) {
        console.error("Error:", e.message)
      }

      ask()
    })
  }

  ask()
}

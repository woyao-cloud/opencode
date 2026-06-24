// ── Run Command — CLI entry point for prompt execution ────────

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { AppRuntime, init } from "../bootstrap"
import { ProviderService } from "@/provider/index"
import type { ResolvedModel } from "@/provider/schema"
import { PromptService } from "@/session/prompt"
import { SessionService } from "@/session/session"
import { ToolRuntimeService } from "@/tool/tool"
import { AgentService } from "@/agent/agent"
import { BackgroundJobService } from "@/background/job"
import { TaskTool, type TaskPromptOps } from "@/tool/task"
import readline from "readline"

const log = Log.create({ service: "cli.run" })

// ── Build tools list including the task tool ─────────────────

async function buildTools(opts: {
  model?: string
  baseURL?: string
  apiKey?: string
}): Promise<Record<string, unknown>> {
  // Get basic tools from the registry
  const basicTools = await AppRuntime.runPromise(
    ToolRuntimeService.use((svc) => Effect.succeed(svc.toAITools())),
  ) as Record<string, unknown>

  // Create a subagent prompt function that runs inside the Effect runtime
  const createTaskPrompt = async (sessionId: string, input: string, subagentType: string): Promise<string> => {
    const result = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const agent = yield* AgentService
        const provider = yield* ProviderService
        const prompt = yield* PromptService

        // Get the subagent's model
        const agentInfo = yield* agent.get(subagentType)
        const model = yield* provider.resolve(agentInfo.model)

        // Run the prompt
        const output = yield* prompt.prompt({
          sessionId,
          userInput: input,
          model,
          tools: basicTools,
        })
        return output.text
      }),
    )
    return result as string
  }

  // Wrap task tool as an AI SDK-compatible entry
  const taskToolEntry = {
    description: TaskTool.description,
    parameters: (() => {
      const schema = TaskTool.parameters as any
      return schema.ast ? JSON.parse(JSON.stringify(schema.ast)) : {}
    })(),
    execute: async (args: Record<string, unknown>) => {
      const params = args as { description: string; prompt: string; subagent_type: string; task_id?: string; background?: boolean }

      // Create a new session for the subagent
      const session: { id: string } = await AppRuntime.runPromise(
        Effect.gen(function* () {
          const sessions = yield* SessionService
          return yield* sessions.create({
            title: `${params.description} (@${params.subagent_type} subagent)`,
            agentId: params.subagent_type,
          })
        }),
      ) as any

      // Run the subagent prompt
      const text = await createTaskPrompt(session.id, params.prompt, params.subagent_type)

      return [
        `task_id: ${session.id} (for resuming to continue this task if needed)`,
        "",
        "<task_result>",
        text,
        "</task_result>",
      ].join("\n")
    },
  }

  return { ...basicTools, task: taskToolEntry }
}

// ── Run Command (single prompt) ─────────────────────────────

export async function runCommand(opts: {
  prompt?: string
  model?: string
  baseURL?: string
  apiKey?: string
  interactive?: boolean
}) {
  await init()

  const tools = await buildTools(opts)

  if (opts.interactive) {
    return runInteractive({ model: opts.model, baseURL: opts.baseURL, apiKey: opts.apiKey, tools })
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

// ── Interactive REPL Mode ───────────────────────────────────

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

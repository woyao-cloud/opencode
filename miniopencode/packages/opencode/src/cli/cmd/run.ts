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

// ── Tools & Session tracking ─────────────────────────────────
// The current session ID is needed by the task tool for background
// result injection. It's set just before each prompt call.

let _parentSessionId = ""

/** Set the parent session ID for background task result injection. */
export function setParentSessionId(id: string) {
  _parentSessionId = id
}

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

  // ── Create the subagent prompt function (promptOps) ─────
  // This is called by executeTask for both sync and background modes.
  const createSubagentPrompt = (sessionId: string, input: string, subagentType: string) =>
    Effect.gen(function* () {
      const agent = yield* AgentService
      const provider = yield* ProviderService
      const prompt = yield* PromptService

      const agentInfo = yield* agent.get(subagentType)
      const model = yield* provider.resolve(agentInfo.model)

      const output = yield* prompt.prompt({
        sessionId,
        userInput: input,
        model,
        tools: basicTools,
      })
      return output
    })

  // ── Task tool entry ─────────────────────────────────────
  // AI SDK-compatible wrapper. Uses executeTask from tool/task.ts
  // with a closure over createSubagentPrompt. Background mode
  // injects results into the parent session (_parentSessionId).
  const taskToolEntry = {
    description: TaskTool.description,
    parameters: (() => {
      const schema = TaskTool.parameters as any
      return schema.ast ? JSON.parse(JSON.stringify(schema.ast)) : {}
    })(),
    execute: async (args: Record<string, unknown>) => {
      const params = args as {
        description: string
        prompt: string
        subagent_type: string
        task_id?: string
        background?: boolean
      }

      const ops: import("@/tool/task").TaskPromptOps = {
        prompt: (subagentSessionId, subagentInput, subagentType) =>
          createSubagentPrompt(subagentSessionId, subagentInput, subagentType).pipe(
            Effect.map((result) => ({ text: result.text })),
          ),
      }

      const { executeTask } = await import("@/tool/task")
      const result = await AppRuntime.runPromise(
        executeTask(params, ops, _parentSessionId),
      )
      return result.output
    },
  }

  return { ...basicTools, task: taskToolEntry } as Record<string, unknown>
}

// ── Run Command (single prompt) ─────────────────────────────

export async function runCommand(opts: {
  prompt?: string
  model?: string
  provider?: string
  baseURL?: string
  apiKey?: string
  interactive?: boolean
}) {
  await init()

  const tools = await buildTools(opts)

  if (opts.interactive) {
    return runInteractive({ model: opts.model, provider: opts.provider, baseURL: opts.baseURL, apiKey: opts.apiKey, tools })
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
      setParentSessionId(session.id) // for background task result injection
      yield* SessionService.use((svc) => svc.updateStatus(session.id, "running"))
      const model = yield* ProviderService.use((svc) => svc.resolve(opts.model, opts.provider))

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
  provider?: string
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
      const model = yield* ProviderService.use((svc) => svc.resolve(opts.model, opts.provider))
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
        setParentSessionId(session.id) // for background task result injection
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
          console.log("\n" + result.toolSteps.map((s: any) => `⚡ ${s.name}(${JSON.stringify(s.args ?? {})})`).join("\n"))
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

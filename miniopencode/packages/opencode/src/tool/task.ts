// ── Task Tool — Launch Subagent Sessions ─────────────────────
// The `task` tool lets the LLM spawn subagents for complex,
// multi-step tasks. Supports foreground (sync) and background
// (async) modes with session continuity via task_id.
//
// Dependencies (AgentService, BusService, etc.) are resolved at
// execution time via Effect context.

import { Effect, Schema } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { ToolContext, ExecuteResult, DefWithoutID } from "./tool"
import { BackgroundJobService } from "@/background/job"
import { BusService } from "@/bus/index"
import { BackgroundTaskCompleted, BackgroundTaskFailed } from "@/bus/bus-event"
import { SessionService } from "@/session/session"
import { AgentService } from "@/agent/index"

const log = Log.create({ service: "tool.task" })

// ── TaskPromptOps — injected via ToolContext by the caller ──

export interface TaskPromptOps {
  readonly prompt: (sessionId: string, input: string, subagentType: string) => Effect.Effect<{ text: string }, Error>
}

// ── Tool Parameters ─────────────────────────────────────────

const Parameters = Schema.Struct({
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use (build, general, explore)" }),
  task_id: Schema.optional(Schema.String).annotate({
    description: "Resume a previous task's session context instead of starting fresh",
  }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
  background: Schema.optional(Schema.Boolean).annotate({
    description: "When true, launch the subagent in the background and return immediately",
  }),
})

// ── Helpers ─────────────────────────────────────────────────

function formatResult(sessionId: string, text: string): string {
  return [
    `task_id: ${sessionId} (for resuming to continue this task if needed)`,
    "",
    "<task_result>",
    text,
    "</task_result>",
  ].join("\n")
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// ── Execution logic — used both from Effect context and AI SDK bridge ──

export function executeTask(
  params: Schema.Schema.Type<typeof Parameters>,
  ctx: ToolContext,
): Effect.Effect<ExecuteResult> {
  return Effect.gen(function* () {
    const agent = yield* AgentService
    const background = yield* BackgroundJobService
    const sessions = yield* SessionService

    // 1. Look up the subagent type
    const agentInfo = yield* agent.get(params.subagent_type)
    log.debug("task agent", { type: params.subagent_type, id: agentInfo.id })

    // 2. Get or create the subagent session
    const taskId = params.task_id
    const existingSession = taskId
      ? yield* sessions.get(taskId).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      : undefined

    const subagentSession = existingSession ?? (yield* sessions.create({
      title: `${params.description} (@${params.subagent_type} subagent)`,
      agentId: params.subagent_type,
    }))

    // 3. Check if already running
    const existingJob = yield* background.get(subagentSession.id)
    if (existingJob?.status === "running") {
      return { title: params.description, output: `Task ${subagentSession.id} is already running.` }
    }

    // 4. Get promptOps from context
    const ops = ctx.extra?.promptOps as TaskPromptOps | undefined
    if (!ops) {
      return yield* Effect.fail(new Error("Task tool requires promptOps in context"))
    }

    // 5. Run the subagent
    const result = yield* ops.prompt(subagentSession.id, params.prompt, params.subagent_type)
    return {
      title: params.description,
      metadata: { sessionId: subagentSession.id, subagentType: params.subagent_type },
      output: formatResult(subagentSession.id, result.text),
    }
  }) as Effect.Effect<ExecuteResult>
}

// ── Tool Definition (no Effect deps at init time) ──────────

const DESCRIPTION = `Launch a new agent to handle complex, multistep tasks autonomously.

Usage notes:
1. Launch multiple agents concurrently whenever possible
2. Send a text summary of the result to the user
3. Use background=true to launch asynchronously
4. Use task_id to resume a previous subagent session
5. Available subagent types: build, general, explore`

export const TaskTool: DefWithoutID<typeof Parameters> = {
  description: DESCRIPTION,
  parameters: Parameters,
  execute: (params, ctx) => executeTask(params, ctx as ToolContext),
}

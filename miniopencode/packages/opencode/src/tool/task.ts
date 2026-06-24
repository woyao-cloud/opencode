// ── Task Tool — Launch Subagent Sessions ─────────────────────
// The `task` tool lets the LLM spawn subagents for complex,
// multi-step tasks. Supports foreground (sync) and background
// (async) modes with session continuity via task_id.
//
// This file provides the schema, helpers, and an Effect-based
// executeTask function that handles both sync and background
// execution. The actual tool entry is constructed in cli/cmd/run.ts
// with a closure over createTaskPrompt (the promptOps).

import { Effect, Schema } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { ExecuteResult, DefWithoutID } from "./tool"
import { BackgroundJobService } from "@/background/job"
import { BusService } from "@/bus/index"
import { BackgroundTaskCompleted, BackgroundTaskFailed } from "@/bus/bus-event"
import { SessionService } from "@/session/session"

const log = Log.create({ service: "tool.task" })

// ── TaskPromptOps — injected via closure by cli/cmd/run.ts ──

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

export type TaskParams = Schema.Schema.Type<typeof Parameters>
export { Parameters as TaskParameters }

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

function formatBackgroundOutput(sessionId: string): string {
  return [
    `task_id: ${sessionId} (for polling this task with task_status)`,
    "state: running",
    "",
    "<task_result>",
    "Background task started. Continue your current work.",
    "</task_result>",
  ].join("\n")
}

function formatBackgroundMessage(
  sessionId: string,
  description: string,
  state: "completed" | "error",
  text: string,
): string {
  const tag = state === "completed" ? "task_result" : "task_error"
  const title = state === "completed"
    ? `Background task completed: ${description}`
    : `Background task failed: ${description}`
  return [
    title,
    `task_id: ${sessionId}`,
    `state: ${state}`,
    "",
    `<${tag}>`,
    text,
    `</${tag}>`,
  ].join("\n")
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// ── Execution logic — used from cli/cmd/run.ts with closure ──

export function executeTask(
  params: TaskParams,
  ops: TaskPromptOps,
  parentSessionId: string,
): Effect.Effect<ExecuteResult, Error, BackgroundJobService | BusService | SessionService> {
  return Effect.gen(function* () {
    const bg = yield* BackgroundJobService
    const sessions = yield* SessionService
    const bus = yield* BusService
    const runInBackground = params.background === true

    // 1. Get or create the subagent session
    const taskId = params.task_id
    const existingSession = taskId
      ? yield* sessions.get(taskId).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      : undefined

    const subagentSession = existingSession ?? (yield* sessions.create({
      title: `${params.description} (@${params.subagent_type} subagent)`,
      agentId: params.subagent_type,
    }))

    // 2. Check if already running
    const existingJob = yield* bg.get(subagentSession.id)
    if (existingJob?.status === "running") {
      return {
        title: params.description,
        metadata: { sessionId: subagentSession.id, subagentType: params.subagent_type },
        output: `Task ${subagentSession.id} is already running. Use task_status to check progress.`,
      }
    }

    // 3. Build the subagent run effect (call runTask() to get the Effect)
    const runTask = Effect.fn("TaskTool.runTask")(function* () {
      const result = yield* ops.prompt(subagentSession.id, params.prompt, params.subagent_type)
      return result.text
    })

    // 4. Background or sync execution
    if (runInBackground) {
      const injectResult = Effect.fn("TaskTool.injectBackgroundResult")(function* (
        state: "completed" | "error",
        text: string,
      ) {
        yield* sessions.appendMessage(parentSessionId, {
          role: "assistant",
          content: formatBackgroundMessage(subagentSession.id, params.description, state, text),
        })
        if (state === "completed") {
          yield* bus.publish(BackgroundTaskCompleted, {
            taskId: subagentSession.id,
            sessionId: parentSessionId,
            description: params.description,
            text,
          })
        } else {
          yield* bus.publish(BackgroundTaskFailed, {
            taskId: subagentSession.id,
            sessionId: parentSessionId,
            description: params.description,
            error: text,
          })
        }
      })

      // Use matchCauseEffect pattern (same as background/job.ts)
      yield* bg.start({
        id: subagentSession.id,
        type: "task",
        title: params.description,
        metadata: { parentSessionId, subagentType: params.subagent_type },
        run: Effect.matchCauseEffect(runTask(), {
          onSuccess: (text) => injectResult("completed", text).pipe(Effect.ignore),
          onFailure: (cause) => {
            const errText = errorText(Cause.squash(cause))
            return Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : injectResult("error", errText).pipe(Effect.ignore)
          },
        }),
      })

      return {
        title: params.description,
        metadata: {
          sessionId: subagentSession.id,
          subagentType: params.subagent_type,
          background: true,
        },
        output: formatBackgroundOutput(subagentSession.id),
      }
    }

    // Sync execution
    const text = yield* runTask()
    return {
      title: params.description,
      metadata: { sessionId: subagentSession.id, subagentType: params.subagent_type },
      output: formatResult(subagentSession.id, text),
    }
  })
}

// ── Tool Definition (schema + description, no Effect deps) ──

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
  execute: (params, _ctx) =>
    Effect.die(new Error("TaskTool.execute should not be called directly — use cli/cmd/run.ts entry with closure")),
}

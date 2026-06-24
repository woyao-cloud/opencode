// ── TaskStatus Tool — Poll background task status ─────────────
// Lets the LLM check on the progress of tasks launched via
// task(background=true). Supports synchronous wait and async poll.

import { Effect, Schema } from "effect"
import type { Info } from "./tool"
import type { ToolContext } from "./tool"
import { BackgroundJobService } from "@/background/job"
import { SessionService } from "@/session/session"
import DESCRIPTION from "./task_status.txt"

const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({ description: "The task_id returned by the task tool" }),
  wait: Schema.optional(Schema.Boolean).annotate({
    description: "When true, wait until the task reaches a terminal state or timeout",
  }),
  timeout_ms: Schema.optional(Schema.Number).annotate({
    description: "Maximum milliseconds to wait when wait=true (default: 60000)",
  }),
})

function format(taskID: string, state: string, text: string) {
  const tag = state === "completed" || state === "running" ? "task_result" : "task_error"
  return [`task_id: ${taskID}`, `state: ${state}`, "", `<${tag}>`, text, `</${tag}>`].join("\n")
}

export const TaskStatusTool: Info<typeof Parameters> = {
  id: "task_status",
  init: () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJobService
      const sessions = yield* SessionService

      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: ToolContext) =>
          Effect.gen(function* () {
            // Check if the task session exists
            const session = yield* sessions.get(params.task_id).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
            if (!session) {
              return {
                title: "Task status",
                metadata: { task_id: params.task_id, state: "error", timed_out: false },
                output: format(params.task_id, "error", `Task not found: ${params.task_id}`),
              }
            }

            const timeout = params.timeout_ms ?? 60_000

            if (params.wait === true) {
              const waited = yield* jobs.wait({ id: params.task_id, timeout })
              const state = waited.info?.status ?? "running"
              const text =
                waited.info?.output ?? waited.info?.error ?? (state === "running" ? "Task is still running." : "")
              const timedOut = waited.timedOut
              const resultText = timedOut
                ? `Timed out after ${timeout}ms while waiting for task completion.`
                : text
              return {
                title: "Task status",
                metadata: { task_id: params.task_id, state, timed_out: timedOut },
                output: format(params.task_id, state, resultText),
              }
            }

            // Non-blocking poll
            const job = yield* jobs.get(params.task_id)
            if (!job) {
              return {
                title: "Task status",
                metadata: { task_id: params.task_id, state: "running", timed_out: false },
                output: format(params.task_id, "running", "Task is still running."),
              }
            }
            const text = job.output ?? job.error ?? (job.status === "running" ? "Task is still running." : "")
            return {
              title: "Task status",
              metadata: { task_id: params.task_id, state: job.status, timed_out: false },
              output: format(params.task_id, job.status, text),
            }
          }),
      }
    }),
}

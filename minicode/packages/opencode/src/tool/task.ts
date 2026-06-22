import { Effect, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import * as Tool from "./tool"
import { Session } from "@/session/session"
import { Agent } from "@/agent/agent"
import { LLM } from "@minicode/llm"
import { ascendingPartID } from "@/session/schema"
import * as ProjectMod from "@/project/project"

const log = Log.create({ service: "tool.task" })

const Parameters = Schema.Struct({
  description: Schema.String.annotate({ description: "A short (3-5 words) description of the task" }),
  prompt: Schema.String.annotate({ description: "The task for the agent to perform" }),
  subagent_type: Schema.String.annotate({ description: "The type of specialized agent to use for this task" }),
  task_id: Schema.optional(Schema.String).annotate({
    description:
      "Resume a previous task session. Pass the task_id from a prior task result to continue the same subagent session.",
  }),
})

export const TaskTool = Tool.define(
  "task",
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const sessions = yield* Session.Service
    const project = yield* ProjectMod.Service

    return {
      description: `Spawn a subagent to perform a task in its own session. Use this when you need to delegate work to a specialized agent. The subagent runs independently and returns its result. You can resume a previous task by passing its task_id.`,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.ToolContext) =>
        Effect.gen(function* () {
          log.info("task tool called", { subagent_type: params.subagent_type, description: params.description })

          // Look up the subagent
          const subagent = yield* agent.get(params.subagent_type)
          if (!subagent) {
            return {
              title: params.description,
              output: `Error: Unknown agent type "${params.subagent_type}". Available agents: ${(yield* agent.list()).map((a: any) => a.name).join(", ")}`,
            }
          }

          // Create or resume child session
          const projectInfo = yield* project.current()
          let sessionID = params.task_id
          let childSession

          if (sessionID) {
            childSession = yield* sessions.get(sessionID as any)
            if (!childSession) {
              return {
                title: params.description,
                output: `Error: task_id "${sessionID}" not found. Create a new task without task_id.`,
              }
            }
          } else {
            childSession = yield* sessions.create({
              projectID: projectInfo.id,
              directory: projectInfo.directory,
              title: `${params.description} (@${params.subagent_type} subagent)`,
              agent: params.subagent_type,
            })
            sessionID = childSession.id as string
          }

          // Append user message
          yield* sessions.appendMessage({
            sessionID: sessionID as any,
            role: "user",
            parts: [{ id: ascendingPartID(), type: "text", text: params.prompt }],
          })

          // Get messages for context
          const messages = yield* sessions.messages(sessionID as any)
          const aiMessages = messages.map((m: any) => ({
            role: m.role,
            content: m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"),
          }))

          // Call LLM with subagent's system prompt
          const system = subagent.prompt ?? "You are a helpful assistant."
          const result = yield* LLM.generate({
            model: ctx.agent === "build" ? { providerID: "openai" as any, modelID: "gpt-4o-mini" as any } : { providerID: "openai" as any, modelID: "gpt-4o-mini" as any },
            system,
            messages: aiMessages as any,
          })

          // Append assistant response
          yield* sessions.appendMessage({
            sessionID: sessionID as any,
            role: "assistant",
            parts: [{ id: ascendingPartID(), type: "text", text: result.text }],
          })

          const output = [
            `task_id: ${sessionID} (for resuming to continue this task if needed)`,
            "",
            "<task_result>",
            result.text,
            "</task_result>",
          ].join("\n")

          return {
            title: params.description,
            output,
            metadata: { task_id: sessionID, subagent_type: params.subagent_type },
          }
        }),
    }
  }),
)

export * as Task from "./task"

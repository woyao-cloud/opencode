// ── Prompt Engine — Core LLM Interaction Loop ─────────────────
// Orchestrates system prompt building, message assembly, LLM
// generation with tool execution, and session persistence.

import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { ModelRef } from "@miniopencode/llm/schema/messages"
import { SessionService } from "./session"
import type { MessageRow } from "./schema"
import { AgentService } from "@/agent/agent"
import { LlmService, type ToolStepEntry } from "./llm"
import { buildSystemPrompt, type SystemPromptOptions } from "./system"
import { buildInstructions } from "./instruction"
import { checkToolPermission } from "@/permission/evaluate"
import { SessionRunStateService } from "./run-state"
import { SessionStatusService } from "./status"

const log = Log.create({ service: "session.prompt" })

// ── Types ───────────────────────────────────────────────────

export interface PromptInput {
  readonly sessionId: string
  readonly userInput: string
  readonly model: ModelRef
  readonly tools: Record<string, unknown>
  readonly instructions?: ReadonlyArray<string>
  readonly signal?: AbortSignal
}

export interface PromptOutput {
  readonly text: string
  readonly usage?: { input: number; output: number }
  readonly toolSteps: ReadonlyArray<ToolStepEntry>
}

// ── Service Interface ───────────────────────────────────────

export interface PromptShape {
  readonly prompt: (input: PromptInput) => Effect.Effect<PromptOutput, Error, SessionService | AgentService | LlmService | SessionRunStateService | SessionStatusService>
}

export class PromptService extends Context.Service<PromptService, PromptShape>()("@miniopencode/Prompt") {}

// ── Helpers ─────────────────────────────────────────────────

/** Convert a MessageRow from SQLite to the LLM input message format. */
function toLlmMessage(msg: MessageRow): { role: string; content: string } {
  if (msg.role === "tool") {
    // Tool result messages: content contains the tool output
    return { role: "tool", content: msg.content }
  }
  if (msg.role === "assistant" && msg.tool_name) {
    // Assistant message with a tool call: content describes the call
    return { role: "assistant", content: msg.content }
  }
  return { role: msg.role as string, content: msg.content }
}

/** Build system prompt from session context and agent info. */
function resolveSystemPrompt(agent: { system?: string; permissions?: string[] }, instructions?: ReadonlyArray<string>, toolKeys?: string[]): string {
  const opts: SystemPromptOptions = {
    agent: { system: agent.system, permissions: agent.permissions },
    instructions: instructions ?? buildInstructions(),
    toolDescriptions: toolKeys?.map((k) => `\`${k}\``),
  }
  return buildSystemPrompt(opts)
}

/**
 * Wrap tool execute functions with permission checking.
 * Each tool's execute function is intercepted to check the tool ID
 * against the agent's permission patterns before running.
 * Denied tools return an error message instead of executing.
 */
function wrapToolsWithPermissionCheck(
  tools: Record<string, unknown>,
  permissions: ReadonlyArray<string>,
): Record<string, unknown> {
  const wrapped: Record<string, any> = {}
  for (const [name, tool] of Object.entries(tools)) {
    const t = tool as any
    if (typeof t.execute !== "function") {
      wrapped[name] = tool
      continue
    }
    const originalExecute = t.execute.bind(t)
    wrapped[name] = {
      ...t,
      execute: async (args: any) => {
        const action = checkToolPermission(name, permissions)
        if (action === "deny") {
          return `Error: Permission denied — tool "${name}" is not allowed by current agent configuration.`
        }
        return originalExecute(args)
      },
    }
  }
  return wrapped
}

// ── Factory ─────────────────────────────────────────────────

export function makePromptService(): PromptShape {
  const prompt = (input: PromptInput): Effect.Effect<PromptOutput, Error, SessionService | AgentService | LlmService | SessionRunStateService | SessionStatusService> =>
    Effect.gen(function* () {
      const session = yield* SessionService
      const agent = yield* AgentService
      const llm = yield* LlmService
      const runState = yield* SessionRunStateService
      const statusService = yield* SessionStatusService

      // 0. Check if session is already busy — fail fast to prevent concurrent runs
      const busy = yield* runState.isBusy(input.sessionId)
      if (busy) {
        return yield* Effect.fail(new Error(`Session ${input.sessionId} is busy`))
      }

      // Mark as busy in run state
      yield* runState.acquire(input.sessionId).pipe(Effect.ignore)

      // Run the prompt work, ensuring release always fires
      const work = Effect.gen(function* () {
        // 1. Get agent info for system prompt
        const agentInfo = yield* agent.defaultAgent()
        log.debug("agent info", { id: agentInfo.id, hasSystem: !!agentInfo.system })

        // 2. Set session status to busy
        yield* statusService.set(input.sessionId, { type: "busy" })

        // 3. Get existing messages from the session
        const existingMessages = yield* session.getMessages(input.sessionId)

        // 4. Build system prompt
        const toolKeys = Object.keys(input.tools)
        const systemPrompt = resolveSystemPrompt(
          { system: agentInfo.system, permissions: agentInfo.permissions as string[] },
          input.instructions,
          toolKeys,
        )

        // 5. Persist user message
        yield* session.appendMessage(input.sessionId, {
          role: "user",
          content: input.userInput,
        })

        // 6. Build full message list for the LLM
        const llmMessages: Array<{ role: string; content: string }> = [
          ...existingMessages.map(toLlmMessage),
          { role: "user", content: input.userInput },
        ]

        // 7. Wrap tools with permission check
        let finalTools = input.tools
        if (agentInfo.permissions?.length) {
          finalTools = wrapToolsWithPermissionCheck(finalTools, agentInfo.permissions as string[])
        }

        // 8. Call the LLM
        const result = yield* llm.generate({
          model: input.model,
          system: systemPrompt,
          messages: llmMessages as any,
          tools: finalTools as Record<string, unknown>,
        })

        // 9. Persist each tool step (call + result pair)
        for (const step of result.toolSteps) {
          yield* session.appendMessage(input.sessionId, {
            role: "assistant",
            content: JSON.stringify({ tool: step.name, args: step.args }),
            toolName: step.name,
            toolArgs: step.args,
          })
          yield* session.appendMessage(input.sessionId, {
            role: "tool",
            content: step.result,
            toolName: step.name,
          })
        }

        // 10. Persist final assistant response (skip if empty — LLM may return no text after tool calls)
        if (result.text && result.text.length > 0) {
          yield* session.appendMessage(input.sessionId, {
            role: "assistant",
            content: result.text,
          })
        }

        log.info("prompt complete", {
          sessionId: input.sessionId,
          textLen: result.text.length,
          toolSteps: result.toolSteps.length,
        })

        return {
          text: result.text,
          usage: result.usage,
          toolSteps: result.toolSteps,
        }
      })

      return yield* work.pipe(
        Effect.ensuring(
          runState.release(input.sessionId).pipe(Effect.ignore),
        ),
      )
    })

  return { prompt }
}

// ── Layer ───────────────────────────────────────────────────

export const PromptLive = Layer.effect(
  PromptService,
  Effect.sync(() => makePromptService()),
)

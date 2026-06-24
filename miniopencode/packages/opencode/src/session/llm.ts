// ── LLM Service — Effect wrapper around @miniopencode/llm ─────

import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { LLM } from "@miniopencode/llm"
import type { ModelRef, Message } from "@miniopencode/llm/schema/messages"

const log = Log.create({ service: "session.llm" })

// ── Types ───────────────────────────────────────────────────

export interface ToolStepEntry {
  readonly name: string
  readonly args: Record<string, unknown>
  readonly result: string
}

export interface LlmGenerateInput {
  readonly model: ModelRef
  readonly system?: string
  readonly messages: ReadonlyArray<Message>
  readonly tools?: Record<string, unknown>
}

export interface LlmGenerateOutput {
  readonly text: string
  readonly usage?: { input: number; output: number }
  readonly toolSteps: ReadonlyArray<ToolStepEntry>
}

// ── Service Interface ───────────────────────────────────────

export interface LlmShape {
  readonly generate: (input: LlmGenerateInput) => Effect.Effect<LlmGenerateOutput, Error>
}

export class LlmService extends Context.Service<LlmService, LlmShape>()("@miniopencode/Llm") {}

// ── Factory ─────────────────────────────────────────────────

export function makeLlmService(): LlmShape {
  return {
    generate: (input) =>
      Effect.gen(function* () {
        const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []
        const toolResults: Array<{ name: string; result: string }> = []

        // Try once, retry once on transient failure
        const result = yield* Effect.retry(
          Effect.gen(function* () {
            const r = yield* LLM.generate({
              model: input.model,
              system: input.system,
              messages: input.messages,
              tools: input.tools as Record<string, any> | undefined,
              onToolCall: (name: string, args: Record<string, unknown>) => {
                toolCalls.push({ name, args })
              },
              onToolResult: (name: string, result: string) => {
                toolResults.push({ name, result })
              },
            })
            return r
          }),
          { times: 1 },
        )

        // Align tool calls with their results (same index)
        const minLen = Math.min(toolCalls.length, toolResults.length)
        const toolSteps: Array<ToolStepEntry> = []
        for (let i = 0; i < minLen; i++) {
          toolSteps.push({
            name: toolCalls[i].name,
            args: toolCalls[i].args,
            result: toolResults[i].result,
          })
        }

        log.info("generate done", {
          textLen: result.text.length,
          toolSteps: toolSteps.length,
          usage: result.usage,
        })

        return { text: result.text, usage: result.usage, toolSteps }
      }),
  }
}

// ── Layer ───────────────────────────────────────────────────

export const LlmLive = Layer.succeed(LlmService, makeLlmService())

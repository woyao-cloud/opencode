import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { generateText, streamText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { ModelRef, type Message } from "./schema/messages"

const log = Log.create({ service: "llm" })

function resolveModel(model: ModelRef) {
  const apiKey = model.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.MINICODE_API_KEY
  const baseURL = model.baseURL ?? "https://api.openai.com/v1"

  if (model.providerID === "openai-compatible" || model.baseURL) {
    const client = createOpenAICompatible({ name: "miniopencode", apiKey, baseURL })
    return client.chatModel(model.modelID as string) as any
  }

  const openai = createOpenAI({ apiKey, baseURL })
  return openai(model.modelID as string) as any
}

function toCoreMessages(messages: ReadonlyArray<Message>): any[] {
  return messages.map((m) => {
    const content = typeof m.content === "string" ? m.content : m.content.map((p: any) => {
      if (p.type === "text") return { type: "text", text: p.text }
      if (p.type === "tool-call") return { type: "tool-call", id: p.id, name: p.name, args: p.input }
      return { type: "tool-result", toolCallId: p.id, toolName: p.name, result: p.result }
    })
    return { role: m.role as any, content }
  })
}

export function generate(input: {
  model: ModelRef
  system?: string
  messages: ReadonlyArray<Message>
  tools?: Record<string, any>
  onToolCall?: (name: string, args: Record<string, unknown>) => void
  onToolResult?: (name: string, result: string) => void
}): Effect.Effect<{ text: string; usage?: { input: number; output: number } }, Error> {
  return Effect.gen(function* () {
    log.info("generate", { model: input.model.modelID, messages: input.messages.length })
    const model = resolveModel(input.model)
    const messages = toCoreMessages([...input.messages])
    const result = yield* Effect.tryPromise({
      try: async () => {
        const opts: any = { model, messages }
        if (input.system) opts.system = input.system
        if (input.tools) {
          opts.tools = input.tools
          opts.maxSteps = 20
          opts.onStepFinish = (event: any) => {
            if (event.toolCalls?.length && input.onToolCall) {
              for (const tc of event.toolCalls) {
                input.onToolCall(tc.toolName ?? tc.name, tc.args)
              }
            }
            if (event.toolResults?.length && input.onToolResult) {
              for (const tr of event.toolResults) {
                const resultText = typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result, null, 2)
                input.onToolResult(tr.toolName ?? tr.name, resultText)
              }
            }
          }
        }
        return generateText(opts)
      },
      catch: (e) => e instanceof Error ? e : new Error(String(e)),
    })
    log.info("generate done", { length: result.text.length })
    return {
      text: result.text,
      usage: result.usage ? { input: result.usage.inputTokens ?? 0, output: result.usage.outputTokens ?? 0 } : undefined,
    }
  })
}

export function stream(input: {
  model: ModelRef
  system?: string
  messages: ReadonlyArray<Message>
  tools?: Record<string, any>
}): Effect.Effect<ReadableStream<Uint8Array>, Error> {
  return Effect.gen(function* () {
    log.info("stream", { model: input.model.modelID, messages: input.messages.length })
    const model = resolveModel(input.model)
    const messages = toCoreMessages([...input.messages])
    const result = streamText({
      model: model as any,
      messages,
      ...(input.system ? { system: input.system } : {}),
      ...(input.tools ? { tools: input.tools } : {}),
    })
    const encoder = new TextEncoder()
    return result.textStream.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(chunk))
      },
    }))
  })
}

export * as LLM from "./llm"

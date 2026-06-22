import { Effect, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import {
  generateText,
  streamText,
  type CoreMessage,
  type Tool as AITool,
} from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { ModelRef, type Message, type GenerationOptions, type ToolDefinition } from "./schema/messages"

const log = Log.create({ service: "llm" })

// 把 minicode 的 ModelRef 解析成 ai-sdk 的 model 对象。
function resolveModel(model: ModelRef) {
  const apiKey = model.apiKey ?? process.env.OPENAI_API_KEY
  const baseURL = model.baseURL ?? "https://api.openai.com/v1"
  const openai = createOpenAI({ apiKey, baseURL })
  return openai(model.modelID as string)
}

// 把 minicode Message 转成 ai-sdk CoreMessage（极简：只处理 text 内容）。
function toCoreMessages(messages: ReadonlyArray<Message>): CoreMessage[] {
  return messages.map((m) => {
    const content = typeof m.content === "string" ? m.content : m.content.map((p) => {
      if (p.type === "text") return { type: "text", text: p.text }
      if (p.type === "tool-call") return { type: "tool-call", id: p.id, name: p.name, args: p.input }
      return { type: "tool-result", toolCallId: p.id, toolName: p.name, result: p.result }
    })
    return { role: m.role as any, content } as CoreMessage
  })
}

// 一次性生成（非流式）。返回完整文本。
export function generate(input: {
  model: ModelRef
  system?: string
  messages: ReadonlyArray<Message>
  generation?: GenerationOptions
  tools?: Record<string, AITool<any>>
}): Effect.Effect<{ text: string; usage?: { input: number; output: number } }, Error> {
  return Effect.gen(function* () {
    log.info("generate", { model: input.model.modelID, messages: input.messages.length })
    const model = resolveModel(input.model)
    const messages = toCoreMessages([...input.messages])
    const result = yield* Effect.tryPromise({
      try: async () => {
        const opts: any = { model, messages }
        if (input.system) opts.system = input.system
        if (input.generation) Object.assign(opts, input.generation)
        if (input.tools) {
          opts.tools = input.tools
          opts.maxSteps = 20
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

// 流式生成。返回 ReadableStream，可被 Stream.runForEach 消费。
export function stream(input: {
  model: ModelRef
  system?: string
  messages: ReadonlyArray<Message>
  generation?: GenerationOptions
  tools?: Record<string, AITool<any>>
}): Effect.Effect<ReadableStream<Uint8Array>, Error> {
  return Effect.gen(function* () {
    log.info("stream", { model: input.model.modelID, messages: input.messages.length })
    const model = resolveModel(input.model)
    const messages = toCoreMessages([...input.messages])
    const result = streamText({
      model,
      messages,
      ...(input.system ? { system: input.system } : {}),
      ...(input.generation ?? {}),
      ...(input.tools ? { tools: input.tools } : {}),
    })
    // 把 ai-sdk 的 textStream 转成 ReadableStream<Uint8Array>
    const encoder = new TextEncoder()
    return result.textStream.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(chunk))
      },
    }))
  })
}

export * as LLM from "./llm"
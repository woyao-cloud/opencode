/**
 * providers/gemini.ts — Google Gemini API provider
 *
 * 实现 Gemini API 的 LLM 生成和流式调用
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { Message, GenerationOptions, ModelRef } from "../schema/messages"

const log = Log.create({ service: "provider.gemini" })

const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta"

export interface GeminiConfig {
  apiKey: string
  baseURL?: string
}

export const generate = (
  config: GeminiConfig,
  model: ModelRef,
  messages: Message[],
  options?: GenerationOptions,
): Effect.Effect<string> =>
  Effect.tryPromise({
    try: async () => {
      const url = `${config.baseURL ?? GEMINI_API}/models/${model.modelId}:generateContent?key=${config.apiKey}`

      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : m.role,
        parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
      }))

      const body: Record<string, unknown> = { contents }
      if (options?.system) {
        body.systemInstruction = { parts: [{ text: options.system }] }
      }
      if (options?.temperature !== undefined) {
        body.generationConfig = { temperature: options.temperature }
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Gemini API error (${res.status}): ${err}`)
      }

      const data = await res.json()
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
    },
    catch: (err) => new Error(`Gemini generation failed: ${err}`),
  })

export const stream = (
  config: GeminiConfig,
  model: ModelRef,
  messages: Message[],
  options?: GenerationOptions,
): ReadableStream<string> => {
  let cancelled = false

  return new ReadableStream<string>({
    async start(controller) {
      try {
        const url = `${config.baseURL ?? GEMINI_API}/models/${model.modelId}:streamGenerateContent?key=${config.apiKey}&alt=sse`

        const contents = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : m.role,
          parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
        }))

        const body: Record<string, unknown> = { contents }
        if (options?.system) {
          body.systemInstruction = { parts: [{ text: options.system }] }
        }

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const err = await res.text()
          controller.error(new Error(`Gemini API error (${res.status}): ${err}`))
          return
        }

        const reader = res.body?.getReader()
        if (!reader) { controller.close(); return }

        const decoder = new TextDecoder()
        let buffer = ""

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.startsWith("data: ")) {
              const data = trimmed.slice(6)
              if (data === "[DONE]") continue
              try {
                const parsed = JSON.parse(data)
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
                if (text) controller.enqueue(text)
              } catch {}
            }
          }
        }

        controller.close()
      } catch (err) {
        if (!cancelled) controller.error(err)
      }
    },
    cancel() { cancelled = true },
  })
}

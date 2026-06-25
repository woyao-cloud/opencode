/**
 * providers/anthropic.ts — Anthropic Messages API provider
 *
 * 实现 Anthropic Messages API 的 LLM 生成和流式调用
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { Message, GenerationOptions, ModelRef } from "../schema/messages"

const log = Log.create({ service: "provider.anthropic" })

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages"

export interface AnthropicConfig {
  apiKey: string
  baseURL?: string
}

export const generate = (
  config: AnthropicConfig,
  model: ModelRef,
  messages: Message[],
  options?: GenerationOptions,
): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const body: Record<string, unknown> = {
        model: model.modelID,
        max_tokens: options?.maxTokens ?? 4096,
        messages: messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        })),
        system: options?.system,
        temperature: options?.temperature,
      }

      const res = await fetch(config.baseURL ?? ANTHROPIC_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Anthropic API error (${res.status}): ${err}`)
      }

      const data = await res.json()
      return data.content?.[0]?.text ?? ""
    },
    catch: (err) => new Error(`Anthropic generation failed: ${err}`),
  })

export const stream = (
  config: AnthropicConfig,
  model: ModelRef,
  messages: Message[],
  options?: GenerationOptions,
): ReadableStream<string> => {
  let cancelled = false
  const encoder = new TextEncoder()

  const stream = new ReadableStream<string>({
    async start(controller) {
      try {
        const body: Record<string, unknown> = {
          model: model.modelID,
          max_tokens: options?.maxTokens ?? 4096,
          messages: messages.map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          })),
          system: options?.system,
          stream: true,
        }

        const res = await fetch(config.baseURL ?? ANTHROPIC_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          const err = await res.text()
          controller.error(new Error(`Anthropic API error (${res.status}): ${err}`))
          return
        }

        const reader = res.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

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
                if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                  controller.enqueue(parsed.delta.text)
                }
              } catch {}
            }
          }
        }

        controller.close()
      } catch (err) {
        if (!cancelled) controller.error(err)
      }
    },
    cancel() {
      cancelled = true
    },
  })

  return stream
}

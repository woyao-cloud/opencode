import type { ModelRef } from "../schema/messages"
import { ProviderID } from "../schema/ids"
import { make } from "../provider"

// OpenAI-Compatible provider：用于 Ollama / DeepSeek / TogetherAI 等。
// 必须显式传 baseURL，因为没有默认值。
export const provider = make({
  id: ProviderID.make("openai-compatible"),
  model: (id, options) => ({
    providerID: ProviderID.make("openai-compatible"),
    modelID: typeof id === "string" ? (id as any) : id,
    apiKey: options?.apiKey,
    baseURL: options?.baseURL,
  }),
})

export function model(id: string, options: { baseURL: string; apiKey?: string }): ModelRef {
  if (!options.baseURL) throw new Error("openai-compatible requires baseURL")
  return provider.model(id, options)
}

export * as OpenAICompatible from "./openai-compatible"
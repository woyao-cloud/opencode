import { ProviderID, ModelID } from "./schema/ids"
import type { ModelRef } from "./schema/messages"

export interface Definition {
  readonly id: ProviderID
  readonly model: (id: string | ModelID, options?: { apiKey?: string; baseURL?: string }) => ModelRef
}

export function make(definition: Definition): Definition {
  return definition
}

// 预定义的 Provider
export const OpenAI = make({
  id: "openai" as ProviderID,
  model: (id, opts) => ({
    provider: "openai" as ProviderID,
    modelId: typeof id === "string" ? id : id,
    apiKey: opts?.apiKey,
    baseURL: opts?.baseURL,
  }),
})

export const Anthropic = make({
  id: "anthropic" as ProviderID,
  model: (id, opts) => ({
    provider: "anthropic" as ProviderID,
    modelId: typeof id === "string" ? id : id,
    apiKey: opts?.apiKey,
    baseURL: opts?.baseURL,
  }),
})

export const Gemini = make({
  id: "gemini" as ProviderID,
  model: (id, opts) => ({
    provider: "gemini" as ProviderID,
    modelId: typeof id === "string" ? id : id,
    apiKey: opts?.apiKey,
    baseURL: opts?.baseURL,
  }),
})

export * as Provider from "./provider"

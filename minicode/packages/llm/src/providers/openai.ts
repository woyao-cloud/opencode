import { createOpenAI } from "@ai-sdk/openai"
import type { ModelRef } from "../schema/messages"
import { ProviderID } from "../schema/ids"
import { make } from "../provider"

// OpenAI provider：默认 https://api.openai.com/v1
export const provider = make({
  id: ProviderID.make("openai"),
  model: (id, options) => ({
    providerID: ProviderID.make("openai"),
    modelID: typeof id === "string" ? (id as any) : id,
    apiKey: options?.apiKey,
    baseURL: options?.baseURL,
  }),
})

export function model(id: string, options?: { apiKey?: string; baseURL?: string }): ModelRef {
  return provider.model(id, options)
}

export * as OpenAI from "./openai"
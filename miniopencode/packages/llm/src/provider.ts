import { ProviderID, ModelID } from "./schema/ids"
import type { ModelRef } from "./schema/messages"

export interface Definition {
  readonly id: ProviderID
  readonly model: (id: string | ModelID, options?: { apiKey?: string; baseURL?: string }) => ModelRef
}

export function make(definition: Definition): Definition {
  return definition
}

export * as Provider from "./provider"

import type { ProviderID, ModelID } from "@miniopencode/llm"

// ── Resolved Model (for passing to LLM.generate) ───────────

export interface ResolvedModel {
  providerID: ProviderID
  modelID: ModelID
  apiKey?: string
  baseURL?: string
}

// ── Config Provider Entry ──────────────────────────────────

export interface ProviderEntry {
  readonly apiKey?: string
  readonly baseURL?: string
  readonly model?: string
}

// ── Config Provider Section ────────────────────────────────

export interface ProviderConfig {
  readonly default?: string
  readonly providers?: Record<string, ProviderEntry>
}

export * as ProviderSchema from "./schema"

import { Schema } from "effect"

// ProviderID 与 ModelID 用 brand 区分，避免把裸字符串混用。
export const ProviderID = Schema.String.pipe(Schema.brand("ProviderID"))
export type ProviderID = Schema.Schema.Type<typeof ProviderID>

export const ModelID = Schema.String.pipe(Schema.brand("ModelID"))
export type ModelID = Schema.Schema.Type<typeof ModelID>

export const ProviderIDMake = (id: string) => ProviderID.make(id)
export const ModelIDMake = (id: string) => ModelID.make(id)

// Provider 元信息：一个 provider 有哪些能力、默认 base URL。
export interface ProviderMetadata {
  readonly id: ProviderID
  readonly name: string
  readonly baseURL?: string
}

export * as IDs from "./ids"
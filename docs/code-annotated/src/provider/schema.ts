/**
 * [provider/schema] - Provider 和 Model 的品牌类型 Schema 定义
 *
 * 功能概述：
 * - 定义 ProviderID 品牌类型（基于 String + brand("ProviderID")）
 * - 定义 ModelID 品牌类型（基于 String + brand("ModelID")）
 * - 预定义已知提供商的常量（opencode / anthropic / openai / google 等）
 *
 * 核心导出：
 * - ProviderID：提供商 ID 品牌类型（含已知提供商常量）
 * - ModelID：模型 ID 品牌类型
 *
 * 架构位置：位于 provider 层的基础模块，被 provider.ts 和 transform.ts 引用
 */
import { Schema } from "effect"

import { withStatics } from "@opencode-ai/core/schema"

const providerIdSchema = Schema.String.pipe(Schema.brand("ProviderID"))

export type ProviderID = typeof providerIdSchema.Type

export const ProviderID = providerIdSchema.pipe(
  withStatics((schema: typeof providerIdSchema) => ({
    // Well-known providers
    opencode: schema.make("opencode"),
    anthropic: schema.make("anthropic"),
    openai: schema.make("openai"),
    google: schema.make("google"),
    googleVertex: schema.make("google-vertex"),
    githubCopilot: schema.make("github-copilot"),
    amazonBedrock: schema.make("amazon-bedrock"),
    azure: schema.make("azure"),
    openrouter: schema.make("openrouter"),
    mistral: schema.make("mistral"),
    gitlab: schema.make("gitlab"),
  })),
)

const modelIdSchema = Schema.String.pipe(Schema.brand("ModelID"))

export type ModelID = typeof modelIdSchema.Type

export const ModelID = modelIdSchema

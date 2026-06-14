/**
 * [provider/model-status] - 模型状态 Schema 定义
 *
 * 功能概述：
 * - 定义模型的可用状态（alpha / beta / deprecated / active）
 * - 从 @opencode-ai/core/models 重新导出 CatalogModelStatus
 *
 * 核心导出：
 * - ModelStatus：模型状态 Schema（Literal 联合类型）
 *
 * 架构位置：位于 provider 层，被 provider.ts 的 Model Schema 引用
 */
import { Schema } from "effect"

export { CatalogModelStatus } from "@opencode-ai/core/models"

export const ModelStatus = Schema.Literals(["alpha", "beta", "deprecated", "active"])
export type ModelStatus = typeof ModelStatus.Type

export * as ProviderModelStatus from "./model-status"

/**
 * [config/model-id] - 模型 ID 配置模块
 *
 * 功能概述：
 * - 定义模型标识符的配置 Schema（字符串类型）
 *
 * 核心导出：
 * - ConfigModelID：模型 ID 字符串 Schema
 *
 * 架构位置：下游被 config/config.ts 引用
 */
import { Schema } from "effect"

export const ConfigModelID = Schema.String

export type ConfigModelID = Schema.Schema.Type<typeof ConfigModelID>

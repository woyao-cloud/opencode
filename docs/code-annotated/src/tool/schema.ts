/**
 * tool/schema - 工具 ID 类型定义
 *
 * 功能概述：
 * - 定义工具标识符（ToolID）的类型和 Schema
 * - 提供工具 ID 的验证和解析
 *
 * 核心导出：
 * - ToolID：工具 ID 类型和 Schema
 * - toolIdSchema：工具 ID 基础 Schema
 *
 * 架构位置：工具系统类型层，被 tool/registry.ts 和其他工具引用
 */
import { Schema } from "effect"

import { Identifier } from "@/id/id"
import { withStatics } from "@opencode-ai/core/schema"

const toolIdSchema = Schema.String.check(Schema.isStartsWith("tool")).pipe(Schema.brand("ToolID"))

export type ToolID = typeof toolIdSchema.Type

export const ToolID = toolIdSchema.pipe(
  withStatics((schema: typeof toolIdSchema) => ({
    ascending: (id?: string) => schema.make(Identifier.ascending("tool", id)),
  })),
)

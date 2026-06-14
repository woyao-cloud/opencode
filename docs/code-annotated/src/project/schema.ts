/**
 * project/schema - 项目 ID Schema：定义项目标识符类型
 *
 * 功能概述：
 * - 定义 ProjectID 品牌类型
 * - 提供 "global" 常量和验证逻辑
 *
 * 核心导出：
 * - ProjectID：项目 ID 品牌类型
 *
 * 架构位置：Project 模块 Schema 层，被 project/project.ts 和其他模块引用。
 */
import { Schema } from "effect"

import { withStatics } from "@opencode-ai/core/schema"

const projectIdSchema = Schema.String.pipe(Schema.brand("ProjectID"))

export type ProjectID = typeof projectIdSchema.Type

export const ProjectID = projectIdSchema.pipe(
  withStatics((schema: typeof projectIdSchema) => ({
    global: schema.make("global"),
  })),
)

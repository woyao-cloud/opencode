/**
 * pty/schema - PTY ID Schema：定义伪终端标识符类型
 *
 * 功能概述：
 * - 定义 PtyID 品牌类型，以 "pty" 前缀开头
 * - 提供自增 ID 生成方法
 *
 * 核心导出：
 * - PtyID：PTY 标识符品牌类型
 *
 * 架构位置：PTY 模块 Schema 层，被 pty/index.ts 服务层使用。
 * 上游依赖：id/id（ID 生成器）
 */
import { Schema } from "effect"

import { Identifier } from "@/id/id"
import { withStatics } from "@opencode-ai/core/schema"

const ptyIdSchema = Schema.String.check(Schema.isStartsWith("pty")).pipe(Schema.brand("PtyID"))

export type PtyID = typeof ptyIdSchema.Type

export const PtyID = ptyIdSchema.pipe(
  withStatics((schema: typeof ptyIdSchema) => ({
    ascending: (id?: string) => schema.make(Identifier.ascending("pty", id)),
  })),
)

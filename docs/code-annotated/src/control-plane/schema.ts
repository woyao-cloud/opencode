/**
 * [control-plane/schema] - 控制面 WorkspaceID 类型定义
 * 功能概述：定义 WorkspaceID 的 branded 类型、校验规则和升序生成方法
 * 核心导出：WorkspaceID
 * 架构位置：domain types layer，被 control-plane/types、workspace 等模块依赖
 */

import { Schema } from "effect"

import { Identifier } from "@/id/id"
import { withStatics } from "@opencode-ai/core/schema"

const workspaceIdSchema = Schema.String.check(Schema.isStartsWith("wrk")).pipe(Schema.brand("WorkspaceID"))

export type WorkspaceID = typeof workspaceIdSchema.Type

export const WorkspaceID = workspaceIdSchema.pipe(
  withStatics((schema: typeof workspaceIdSchema) => ({
    ascending: (id?: string) => schema.make(Identifier.ascending("workspace", id)),
  })),
)

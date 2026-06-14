/**
 * [sync/schema] - 同步事件 Schema 定义
 *
 * 功能概述：
 * - 定义事件 ID 的 Effect Schema（以 "evt" 开头，带 brand 标记）
 *
 * 核心导出：
 * - EventID：事件 ID 的 Effect Schema
 *
 * 架构位置：上游依赖 Effect Schema；下游被 sync/index.ts 引用
 */
import { Schema } from "effect"

import { Identifier } from "@/id/id"
import { withStatics } from "@opencode-ai/core/schema"

export const EventID = Schema.String.check(Schema.isStartsWith("evt")).pipe(
  Schema.brand("EventID"),
  withStatics((s) => ({
    ascending: (id?: string) => s.make(Identifier.ascending("event", id)),
  })),
)

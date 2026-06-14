/**
 * session/schema - 会话 ID 类型定义（SessionID、MessageID、PartID）
 *
 * 功能概述：
 * - 定义 SessionID：继承自 core/session 的 ID 类型
 * - 定义 MessageID：以 "msg" 开头的字符串，带品牌标签和升序生成器
 * - 定义 PartID：以 "prt" 开头的字符串，带品牌标签和升序生成器
 * - 所有 ID 类型均使用 Effect Schema 进行运行时校验
 *
 * 核心导出：
 * - SessionID：会话 ID 类型和 Schema
 * - MessageID：消息 ID 类型和 Schema（含 ascending 工厂方法）
 * - PartID：Part ID 类型和 Schema（含 ascending 工厂方法）
 *
 * 架构位置：会话系统的 ID 基础层，被几乎所有 session/ 模块依赖。
 * 上游依赖：@/id/id（Identifier 工具）、@opencode-ai/core/session
 * 下游消费：session/*、tool/*、storage/* 等全部模块
 */

import { Schema } from "effect"

export const SessionID = CoreSession.ID
export type SessionID = Schema.Schema.Type<typeof SessionID>

export const MessageID = Schema.String.check(Schema.isStartsWith("msg")).pipe(
  Schema.brand("MessageID"),
  withStatics((s) => ({
    ascending: (id?: string) => s.make(Identifier.ascending("message", id)),
  })),
)

export type MessageID = Schema.Schema.Type<typeof MessageID>

export const PartID = Schema.String.check(Schema.isStartsWith("prt")).pipe(
  Schema.brand("PartID"),
  withStatics((s) => ({
    ascending: (id?: string) => s.make(Identifier.ascending("part", id)),
  })),
)

export type PartID = Schema.Schema.Type<typeof PartID>

/**
 * session/message-error - 消息相关错误类型定义
 *
 * 功能概述：
 * - OutputLengthError：消息输出超长错误
 * - AuthError：Provider 认证错误（含 providerID 和 message）
 * - SharedSchema：统一导出所有可共享的错误 Schema
 *
 * 核心导出：
 * - OutputLengthError、AuthError
 * - SharedSchema：用于消息 metadata 的错误联合 Schema
 *
 * 架构位置：会话系统的错误类型基础层。
 * 上游依赖：Effect Schema、NamedError
 * 下游消费：session/message-v2.ts、session/message.ts
 */

import { Schema } from "effect"
import { NamedError } from "@opencode-ai/core/util/error"

export const OutputLengthError = NamedError.create("MessageOutputLengthError", {})

export const AuthError = NamedError.create("ProviderAuthError", {
  providerID: Schema.String,
  message: Schema.String,
})

export const Shared = [AuthError.EffectSchema, NamedError.Unknown.EffectSchema, OutputLengthError.EffectSchema] as const
export const SharedSchema = Schema.Union(Shared)

export * as MessageError from "./message-error"

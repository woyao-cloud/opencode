/**
 * handlers/session-errors - 会话错误类型
 *
 * 功能概述：
 * - 定义会话处理中的错误类型（如存储未找到）
 *
 * 核心导出：
 * - 会话错误相关类型
 *
 * 架构位置：HTTP API 处理器层，被 session 处理器引用
 */

import type { NotFoundError as StorageNotFoundError } from "@/storage/storage"
import type { Session } from "@/session/session"
import { Effect } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import * as ApiError from "../errors"

export function mapStorageNotFound<A, R>(self: Effect.Effect<A, StorageNotFoundError, R>) {
  return self.pipe(Effect.mapError((error) => ApiError.notFound(error.message)))
}

export function mapBusy<A, R>(self: Effect.Effect<A, Session.BusyError, R>) {
  return self.pipe(Effect.catchTag("SessionBusyError", () => Effect.fail(new HttpApiError.BadRequest({}))))
}

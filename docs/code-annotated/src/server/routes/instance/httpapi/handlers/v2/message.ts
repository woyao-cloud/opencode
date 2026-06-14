/**
 * handlers/v2/message - V2 消息 API 处理器
 *
 * 功能概述：
 * - 实现 V2 版本消息相关的 HTTP API 端点业务逻辑
 *
 * 核心导出：
 * - V2 消息 API 处理器函数
 *
 * 架构位置：HTTP API V2 处理器层，依赖 SessionMessage 和 SessionV2
 */

import { SessionMessage } from "@opencode-ai/core/session-message"
import { SessionV2 } from "@/v2/session"
import { Effect, Schema } from "effect"
import * as DateTime from "effect/DateTime"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../../api"

const DefaultMessagesLimit = 50

const Cursor = Schema.Struct({
  id: SessionMessage.ID,
  time: Schema.Finite,
  order: Schema.Union([Schema.Literal("asc"), Schema.Literal("desc")]),
  direction: Schema.Union([Schema.Literal("previous"), Schema.Literal("next")]),
})

const decodeCursor = Schema.decodeUnknownSync(Cursor)

const cursor = {
  encode(message: SessionMessage.Message, order: "asc" | "desc", direction: "previous" | "next") {
    return Buffer.from(
      JSON.stringify({ id: message.id, time: DateTime.toEpochMillis(message.time.created), order, direction }),
    ).toString("base64url")
  },
  decode(input: string) {
    return decodeCursor(JSON.parse(Buffer.from(input, "base64url").toString("utf8")))
  },
}

export const messageHandlers = HttpApiBuilder.group(InstanceHttpApi, "v2.message", (handlers) =>
  Effect.gen(function* () {
    const session = yield* SessionV2.Service

    return handlers.handle(
      "messages",
      Effect.fn(function* (ctx) {
        if (ctx.query.cursor && ctx.query.order !== undefined) return yield* new HttpApiError.BadRequest({})
        const decoded = yield* Effect.try({
          try: () => (ctx.query.cursor ? cursor.decode(ctx.query.cursor) : undefined),
          catch: () => new HttpApiError.BadRequest({}),
        })
        const order = decoded?.order ?? ctx.query.order ?? "desc"
        const messages = yield* session.messages({
          sessionID: ctx.params.sessionID,
          limit: ctx.query.limit ?? DefaultMessagesLimit,
          order,
          cursor: decoded ? { id: decoded.id, time: decoded.time, direction: decoded.direction } : undefined,
        })
        const first = messages[0]
        const last = messages.at(-1)
        return {
          items: messages,
          cursor: {
            previous: first ? cursor.encode(first, order, "previous") : undefined,
            next: last ? cursor.encode(last, order, "next") : undefined,
          },
        }
      }),
    )
  }),
)

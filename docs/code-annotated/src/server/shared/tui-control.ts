/**
 * server/shared/tui-control - TUI 控制消息处理
 *
 * 功能概述：
 * - 处理 TUI 控制消息的 Schema 定义与队列管理
 *
 * 核心导出：
 * - TUI 控制相关 Schema 与队列类型
 *
 * 架构位置：被 TUI 路由处理器引用，依赖 AsyncQueue
 */

import { AsyncQueue } from "@/util/queue"
import { Schema } from "effect"

export const TuiRequest = Schema.Struct({
  path: Schema.String,
  body: Schema.Unknown,
})

export type TuiRequest = Schema.Schema.Type<typeof TuiRequest>

const request = new AsyncQueue<TuiRequest>()
const response = new AsyncQueue<unknown>()

export function nextTuiRequest() {
  return request.next()
}

export function submitTuiRequest(body: TuiRequest) {
  request.push(body)
}

export function submitTuiResponse(body: unknown) {
  response.push(body)
}

export function nextTuiResponse() {
  return response.next()
}

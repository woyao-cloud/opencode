/**
 * session/revert.ts — Session 回退
 *
 * 支持将 Session 回退到之前的快照状态
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "session.revert" })

export interface RevertPoint {
  readonly id: string
  readonly sessionId: string
  readonly messageIndex: number
  readonly timestamp: number
  readonly description: string
}

/**
 * 创建回退点
 */
export const createPoint = (
  sessionId: string,
  messageIndex: number,
  description: string,
): RevertPoint => ({
  id: `revert-${Date.now()}-${messageIndex}`,
  sessionId,
  messageIndex,
  timestamp: Date.now(),
  description,
})

/**
 * 回退到指定点：截断消息列表到指定索引
 */
export const revert = <T>(
  messages: T[],
  point: RevertPoint,
): T[] => {
  if (point.messageIndex >= messages.length) {
    log.warn("revert point beyond messages", { index: point.messageIndex, total: messages.length })
    return messages
  }
  const reverted = messages.slice(0, point.messageIndex + 1)
  log.info("session reverted", { to: point.messageIndex, from: messages.length, kept: reverted.length })
  return reverted
}

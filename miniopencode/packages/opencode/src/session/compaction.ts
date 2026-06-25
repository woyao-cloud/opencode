/**
 * session/compaction.ts — Session 压缩
 *
 * 当 Session 消息过多时，压缩历史消息以节省 token
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "session.compaction" })

export interface CompactionResult {
  readonly kept: number
  readonly removed: number
  readonly summary: string
}

const MAX_MESSAGES = 50
const KEEP_RECENT = 10

/**
 * 检查 Session 是否需要压缩
 */
export const isOverflow = (messageCount: number): boolean =>
  messageCount > MAX_MESSAGES

/**
 * 压缩消息列表：保留最近的 N 条，移除中间的
 */
export const compact = <T>(
  messages: T[],
  summarize: (removed: T[]) => string,
): { messages: T[]; result: CompactionResult } => {
  if (messages.length <= MAX_MESSAGES) {
    return { messages, result: { kept: messages.length, removed: 0, summary: "" } }
  }

  const keep = messages.slice(0, 1).concat(messages.slice(-KEEP_RECENT))
  const removed = messages.slice(1, -KEEP_RECENT)
  const summary = summarize(removed)

  log.info("session compacted", { total: messages.length, kept: keep.length, removed: removed.length })

  return {
    messages: keep,
    result: { kept: keep.length, removed: removed.length, summary },
  }
}

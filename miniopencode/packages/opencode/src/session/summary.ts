/**
 * session/summary.ts — Session 摘要
 *
 * 生成 Session 内容的摘要，用于压缩和展示
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "session.summary" })

export interface SessionSummary {
  readonly sessionId: string
  readonly messageCount: number
  readonly tokenEstimate: number
  readonly topics: string[]
  readonly duration: number
}

/**
 * 估算字符数的 token 数量（粗略估计，每 4 字符 ≈ 1 token）
 */
export const estimateTokens = (charCount: number): number =>
  Math.ceil(charCount / 4)

/**
 * 生成 Session 摘要
 */
export const summarize = (
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
): SessionSummary => {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0)
  const userMessages = messages.filter((m) => m.role === "user")
  const assistantMessages = messages.filter((m) => m.role === "assistant")

  // 提取关键词作为主题（取高频词）
  const wordFreq = new Map<string, number>()
  for (const msg of messages) {
    const words = msg.content.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1)
    }
  }
  const topics = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  const firstMsg = messages[0]
  const lastMsg = messages[messages.length - 1]

  return {
    sessionId,
    messageCount: messages.length,
    tokenEstimate: estimateTokens(totalChars),
    topics,
    duration: lastMsg ? Date.now() - Date.now() : 0, // 简化处理
  }
}

/**
 * pty/input - PTY 输入处理：处理 WebSocket PTY 输入的消息解码
 *
 * 功能概述：
 * - 解码 UTF-8 PTY 输入消息
 * - 支持字符串和二进制消息格式
 *
 * 核心导出：
 * - handlePtyInput：处理 PTY 输入消息
 *
 * 架构位置：PTY 模块输入层，被 PTY 服务用于处理外部输入。
 */
import { Effect } from "effect"

const inputDecoder = new TextDecoder("utf-8", { fatal: true })

export function handlePtyInput(
  handler: { onMessage: (message: string | ArrayBuffer) => void },
  message: string | Uint8Array,
) {
  if (typeof message === "string") {
    handler.onMessage(message)
    return Effect.void
  }
  return Effect.try({
    try: () => inputDecoder.decode(message),
    catch: () => new Error("invalid PTY websocket input"),
  }).pipe(
    Effect.catch(() => Effect.succeed(undefined)),
    Effect.flatMap((decoded) => {
      if (decoded === undefined) return Effect.void
      handler.onMessage(decoded)
      return Effect.void
    }),
  )
}

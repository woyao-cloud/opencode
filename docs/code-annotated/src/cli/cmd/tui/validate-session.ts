/**
 * cli/cmd/tui/validate-session - 会话验证工具
 *
 * 功能概述：
 * - 验证远程 opencode 服务器上的会话是否存在并可访问
 * - 通过 SDK v2 客户端连接服务器并检查会话状态
 *
 * 核心导出：
 * - validateSession(input): 验证会话的异步函数
 *
 * 架构位置：TUI 工具层，被 attach.ts 和 thread.ts 引用
 */

import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { SessionID } from "@/session/schema"
import { Schema } from "effect"

const decodeSessionID = Schema.decodeUnknownSync(SessionID)

export async function validateSession(input: {
  url: string
  sessionID?: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
}) {
  if (!input.sessionID) return

  let sessionID: SessionID
  try {
    sessionID = decodeSessionID(input.sessionID)
  } catch (error) {
    throw new Error(`Invalid session ID: ${error instanceof Error ? error.message : "unknown error"}`, { cause: error })
  }

  await createOpencodeClient({
    baseUrl: input.url,
    directory: input.directory,
    fetch: input.fetch,
    headers: input.headers,
  }).session.get({ sessionID }, { throwOnError: true })
}

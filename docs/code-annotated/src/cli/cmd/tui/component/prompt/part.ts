/**
 * cli/cmd/tui/component/prompt/part - 提示部件工具
 *
 * 功能概述：
 * - 提供提示部件的剥离处理函数，移除内部 ID 字段
 *
 * 核心导出：
 * - strip(part): 移除部件的 id/messageID/sessionID 字段
 *
 * 架构位置：TUI 组件层，被 prompt 相关模块引用
 */

import { PartID } from "@/session/schema"
import type { PromptInfo } from "./history"

type Item = PromptInfo["parts"][number]

export function strip(part: Item & { id: string; messageID: string; sessionID: string }): Item {
  const { id: _id, messageID: _messageID, sessionID: _sessionID, ...rest } = part
  return rest
}

export function assign(part: Item): Item & { id: PartID } {
  return {
    ...part,
    id: PartID.ascending(),
  }
}

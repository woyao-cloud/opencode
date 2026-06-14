/**
 * acp/types - ACP 协议类型定义
 *
 * 功能概述：
 * - 定义 ACP 会话状态（ACPSessionState）接口
 * - 定义 ACP 配置（ACPConfig）接口
 *
 * 核心导出：
 * - ACPSessionState：ACP 会话状态类型
 * - ACPConfig：ACP 配置类型
 *
 * 架构位置：ACP 协议实现的数据类型层，被 agent 和 session 模块引用
 */

import type { McpServer } from "@agentclientprotocol/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import type { ProviderID, ModelID } from "../provider/schema"

/**
 * ACP 会话状态接口。
 * 跟踪每个 ACP 会话的 ID、工作目录、MCP 服务器、创建时间、
 * 当前模型、effort 变体和模式。
 */
export interface ACPSessionState {
  id: string
  cwd: string
  mcpServers: McpServer[]
  createdAt: Date
  model?: {
    providerID: ProviderID
    modelID: ModelID
  }
  variant?: string
  modeId?: string
}

/**
 * ACP 配置接口。
 * 包含 SDK 客户端实例和可选的默认模型配置。
 */
export interface ACPConfig {
  sdk: OpencodeClient
  defaultModel?: {
    providerID: ProviderID
    modelID: ModelID
  }
}

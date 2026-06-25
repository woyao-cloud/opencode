/**
 * mcp/schema.ts — MCP 协议核心类型
 *
 * 定义 JSON-RPC 消息格式、MCP 工具/资源 Schema
 * 参考: packages/opencode/src/mcp/index.ts
 */

import { Schema } from "effect"

// ===== JSON-RPC 基础 =====

export const JSONRPCVersion = Schema.Literal("2.0")
export type JSONRPCVersion = Schema.Schema.Type<typeof JSONRPCVersion>

export const RequestId = Schema.Union([Schema.String, Schema.Number])
export type RequestId = Schema.Schema.Type<typeof RequestId>

// ===== MCP 工具定义 =====

export const ToolInputSchema = Schema.Struct({
  type: Schema.Literal("object"),
  properties: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  required: Schema.optional(Schema.Array(Schema.String)),
})
export type ToolInputSchema = Schema.Schema.Type<typeof ToolInputSchema>

export const ToolDefinition = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  inputSchema: Schema.optional(ToolInputSchema),
})
export type ToolDefinition = Schema.Schema.Type<typeof ToolDefinition>

// ===== MCP 资源定义 =====

export const ResourceDefinition = Schema.Struct({
  name: Schema.String,
  uri: Schema.String,
  description: Schema.optional(Schema.String),
  mimeType: Schema.optional(Schema.String),
})
export type ResourceDefinition = Schema.Schema.Type<typeof ResourceDefinition>

// ===== MCP 服务器状态 =====

export const ServerStatus = Schema.Union([
  Schema.Struct({ status: Schema.Literal("disconnected") }),
  Schema.Struct({ status: Schema.Literal("connecting") }),
  Schema.Struct({ status: Schema.Literal("connected") }),
  Schema.Struct({ status: Schema.Literal("failed"), error: Schema.String }),
])
export type ServerStatus = Schema.Schema.Type<typeof ServerStatus>

// ===== MCP 服务器配置 =====

export const ServerConfig = Schema.Struct({
  name: Schema.String,
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
export type ServerConfig = Schema.Schema.Type<typeof ServerConfig>

// ===== JSON-RPC 消息 =====

export interface JSONRPCRequest {
  jsonrpc: "2.0"
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface JSONRPCResponse {
  jsonrpc: "2.0"
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface JSONRPCNotification {
  jsonrpc: "2.0"
  method: string
  params?: Record<string, unknown>
}

// ===== MCP 协议方法 =====

export const Methods = {
  // 初始化
  initialize: "initialize",
  initialized: "initialized",
  // 工具
  toolsList: "tools/list",
  toolsCall: "tools/call",
  // 资源
  resourcesList: "resources/list",
  resourcesRead: "resources/read",
  // 通知
  toolsChanged: "notifications/tools/list_changed",
  resourcesChanged: "notifications/resources/list_changed",
} as const

// ===== 工具调用结果 =====

export const CallToolResult = Schema.Struct({
  content: Schema.Array(
    Schema.Struct({
      type: Schema.Literal("text", "image", "resource"),
      text: Schema.optional(Schema.String),
      mimeType: Schema.optional(Schema.String),
    }),
  ),
  isError: Schema.optional(Schema.Boolean),
})
export type CallToolResult = Schema.Schema.Type<typeof CallToolResult>

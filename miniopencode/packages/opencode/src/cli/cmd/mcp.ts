/**
 * cli/cmd/mcp.ts — MCP 管理命令
 *
 * 列出和测试 MCP 服务器连接
 */

import { Effect } from "effect"
import { MCPServiceTag } from "@/mcp/index"

export const mcpListCommand = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    const mcp = yield* MCPServiceTag
    const servers = yield* mcp.listServers()
    if (servers.length === 0) {
      console.log("没有配置 MCP 服务器")
      return
    }
    console.log("MCP 服务器:")
    for (const s of servers) {
      console.log(`  ${s.name}: ${s.status}`)
    }
    const tools = yield* mcp.listTools()
    console.log(`\n可用工具 (${tools.length}):`)
    for (const { server, tool } of tools) {
      console.log(`  [${server}] ${tool.name}: ${tool.description ?? "无描述"}`)
    }
  })

/**
 * cli/cmd/mcp.ts — MCP management commands
 *
 * List and inspect MCP server connections.
 */

import { Effect } from "effect"
import { AppRuntime, init } from "../bootstrap"
import { MCPServiceTag } from "@/mcp/index"

export async function mcpListCommand() {
  await init()

  await AppRuntime.runPromise(
    Effect.gen(function* () {
      const mcp = yield* MCPServiceTag
      const servers = yield* mcp.listServers()
      if (servers.length === 0) {
        console.log("No MCP servers configured.")
        return
      }
      console.log("MCP servers:")
      for (const s of servers) {
        console.log(`  ${s.name}: ${s.status}`)
      }
      const tools = yield* mcp.listTools()
      console.log(`\nAvailable tools (${tools.length}):`)
      for (const { server, tool } of tools) {
        console.log(`  [${server}] ${tool.name}: ${tool.description ?? "(no description)"}`)
      }
    }),
  )
}

export async function mcpResolveCommand() {
  await init()
  console.log("MCP resolve: not yet implemented")
}

export * as McpCommand from "./mcp"

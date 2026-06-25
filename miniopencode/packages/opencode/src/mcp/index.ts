/**
 * mcp/index.ts — MCP 服务层
 *
 * 管理多个 MCP 服务器连接，提供工具发现和调用能力
 * 集成到 miniopencode 的 Layer 系统中
 */

import { Effect, Layer, Context, Schema } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { ConfigService } from "@/config/config"
import { makeStdioTransport, makeClient, type MCPClient } from "./client"
import { ServerConfig, type ToolDefinition, type CallToolResult } from "./schema"

const log = Log.create({ service: "mcp" })

// ===== 服务接口 =====

export interface MCPService {
  readonly listTools: () => Effect.Effect<Array<{ server: string; tool: ToolDefinition }>>
  readonly callTool: (server: string, name: string, args: Record<string, unknown>) => Effect.Effect<CallToolResult>
  readonly listServers: () => Effect.Effect<Array<{ name: string; status: string }>>
}

// ===== Context Tag =====

export class MCPServiceTag extends Context.Service<MCPServiceTag, MCPService>()("@miniopencode/MCP") {}

// ===== Layer 实现 =====

export const MCPLive = Layer.effect(
  MCPServiceTag,
  Effect.gen(function* () {
    const config = yield* ConfigService
    const mcpConfigs: ServerConfig[] = (config.config as any)?.mcp?.servers ?? []

    // 启动所有 MCP 服务器
    const clients = new Map<string, MCPClient>()

    for (const cfg of mcpConfigs) {
      try {
        if (cfg.command) {
          const transport = makeStdioTransport({
            command: cfg.command,
            args: cfg.args ?? [],
            env: cfg.env,
          })
          const client = yield* makeClient(transport, cfg.name)
          clients.set(cfg.name, client)
          log.info("MCP server connected", { name: cfg.name })
        }
      } catch (err) {
        log.error("MCP server failed to connect", { name: cfg.name, error: String(err) })
      }
    }

    return {
      listTools: () =>
        Effect.forEach(
          Array.from(clients.entries()),
          ([server, client]) =>
            Effect.map(client.tools(), (tools) =>
              tools.map((tool) => ({ server, tool })),
            ),
          { concurrency: 5 },
        ).pipe(Effect.map((results) => results.flat())),

      callTool: (server: string, name: string, args: Record<string, unknown>) => {
        const client = clients.get(server)
        if (!client) {
          return Effect.fail(new Error(`MCP server not found: ${server}`))
        }
        return client.callTool(name, args)
      },

      listServers: () =>
        Effect.succeed(
          Array.from(clients.entries()).map(([name, _client]) => ({
            name,
            status: "connected" as const,
          })),
        ),
    }
  }),
)

/**
 * mcp/tool.ts — MCP 工具适配器
 *
 * 将 MCP 服务器的工具适配为 miniopencode 的 Tool 接口
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { MCPServiceTag } from "./index"
import type { Def } from "@/tool/tool"

const log = Log.create({ service: "mcp.tool" })

/**
 * 从所有 MCP 服务器发现工具，生成 Tool Def 列表
 */
export const discoverMCPTools = (): Effect.Effect<Array<Def<any>>> =>
  Effect.gen(function* () {
    const mcp = yield* MCPServiceTag
    const tools = yield* mcp.listTools()

    return tools.map(({ server, tool }) => {
      const def: Def<any> = {
        name: `mcp_${server}_${tool.name}`,
        description: `[MCP/${server}] ${tool.description ?? tool.name}`,
        parameters: (tool.inputSchema as any) ?? { type: "object", properties: {} },
        execute: (args: Record<string, unknown>) =>
          Effect.gen(function* () {
            log.info("calling MCP tool", { server, tool: tool.name })
            const result = yield* mcp.callTool(server, tool.name, args)
            const text = result.content
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join("\n")
            return text || JSON.stringify(result.content)
          }),
      }
      return def
    })
  })

// ── MCP Handlers ─────────────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { MCPServiceTag } from "@/mcp"
import { InstanceHttpApi } from "../api"

export const mcpHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "mcp", (handlers: any) =>
  Effect.gen(function* () {
    const mcp = yield* MCPServiceTag

    handlers.handle("mcpList", () =>
      Effect.succeed([])
    )

    handlers.handle("mcpTools", () =>
      Effect.succeed([])
    )

    return handlers
  })
)

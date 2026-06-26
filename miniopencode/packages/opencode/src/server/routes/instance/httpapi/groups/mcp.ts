// ── MCP API Group ────────────────────────────────────────────────

import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const MCPGroup = HttpApiGroup.make("mcp")
  .add(
    HttpApiEndpoint.get("mcpList", "/mcp", {
      success: Schema.Array(Schema.Unknown),
    }),
    HttpApiEndpoint.get("mcpTools", "/mcp/tools", {
      success: Schema.Array(Schema.Unknown),
    }),
  )

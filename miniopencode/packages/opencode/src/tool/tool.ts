import { Effect, Context, Layer } from "effect"

// ── Tool Types ─────────────────────────────────────────────

export interface ToolDef {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

export interface Tool extends ToolDef {
  readonly execute: (args: Record<string, unknown>) => Promise<string>
}

export type ToolMap = Record<string, Tool>

// ── Tool Runtime Service ───────────────────────────────────

export interface ToolRuntimeShape {
  readonly tools: () => ReadonlyArray<Tool>
  readonly get: (name: string) => Tool | undefined
  readonly execute: (name: string, args: Record<string, unknown>) => Promise<string>
  readonly toAITools: () => Record<string, { description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<string> }>
}

export class ToolRuntimeService extends Context.Service<ToolRuntimeService, ToolRuntimeShape>()("@miniopencode/ToolRuntime") {}

// ── Make Runtime ───────────────────────────────────────────

export function makeRuntime(tools: ReadonlyArray<Tool>): ToolRuntimeShape {
  const toolMap: ToolMap = {}
  for (const tool of tools) {
    toolMap[tool.name] = tool
  }

  return {
    tools: () => tools,
    get: (name: string) => toolMap[name],
    execute: async (name: string, args: Record<string, unknown>) => {
      const tool = toolMap[name]
      if (!tool) throw new Error(`Tool not found: ${name}`)
      return tool.execute(args)
    },
    toAITools: () => {
      const result: Record<string, any> = {}
      for (const tool of tools) {
        result[tool.name] = {
          description: tool.description,
          parameters: tool.parameters,
          execute: (args: Record<string, unknown>) => tool.execute(args),
        }
      }
      return result
    },
  }
}

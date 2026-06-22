import { Effect } from "effect"
import type { AnyTool, ToolExecuteContext } from "./tool"
import { toDefinitions } from "./tool"
import type { ToolDefinition } from "./schema/messages"

// 极简工具运行时：在 LLM 流中遇到 tool-call 时调用对应工具的 execute。
// opencode 的 tool-runtime 还处理 provider-executed tools、流式 tool-input-delta
// 等，minicode 初版只做核心路径。
export interface RuntimeState {
  readonly tools: Record<string, AnyTool>
  readonly definitions: ReadonlyArray<ToolDefinition>
}

export function makeRuntime(tools: Record<string, AnyTool>): RuntimeState {
  return {
    tools,
    definitions: toDefinitions(tools),
  }
}

export function dispatch(
  state: RuntimeState,
  name: string,
  input: unknown,
  ctx: ToolExecuteContext,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const tool = state.tools[name]
    if (!tool?.execute) return yield* Effect.fail(new Error(`tool ${name} not found or not executable`))
    const decoded = yield* tool._decode(input)
    return yield* tool.execute(decoded, ctx)
  })
}

export * as ToolRuntime from "./tool-runtime"
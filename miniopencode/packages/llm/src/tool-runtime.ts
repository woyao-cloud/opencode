import { Effect } from "effect"
import type { ToolSchema } from "./tool"
import type { ModelRef } from "./schema/messages"

export interface ToolRuntime {
  readonly execute: (tool: string, args: unknown, model: ModelRef) => Effect.Effect<string, Error>
}

export function make(runtime: ToolRuntime): ToolRuntime {
  return runtime
}

export * as ToolRuntime from "./tool-runtime"

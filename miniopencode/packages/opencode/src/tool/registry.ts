import { Effect, Layer } from "effect"
import { ToolRuntimeService, makeRuntime } from "./tool"
import type { Info } from "./tool"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { BashTool } from "./bash"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"

// Basic tools — no Effect dependencies, can be eagerly initialized.
const defaultToolInfos: ReadonlyArray<Info<any>> = [
  Effect.runSync(ReadTool),
  Effect.runSync(WriteTool),
  Effect.runSync(BashTool),
  Effect.runSync(GlobTool),
  Effect.runSync(GrepTool),
]

export function getAllToolInfos(): ReadonlyArray<Info<any>> {
  return defaultToolInfos
}

export const ToolRuntimeLive = Layer.succeed(
  ToolRuntimeService,
  makeRuntime(defaultToolInfos),
)

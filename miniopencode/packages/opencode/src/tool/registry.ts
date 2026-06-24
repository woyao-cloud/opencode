import { Effect, Layer } from "effect"
import { ToolRuntimeService, makeRuntime } from "./tool"
import type { Info } from "./tool"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { BashTool } from "./bash"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { WebFetchTool } from "./webfetch"
import { WebSearchTool } from "./websearch"
import { TaskStatusTool } from "./task_status"
import { SkillTool } from "./skill"

// Tools that can be eagerly initialized (no Effect service dependencies).
// These are exposed via toAITools() for direct LLM use.
const eagerToolInfos: ReadonlyArray<Info<any>> = [
  Effect.runSync(ReadTool),
  Effect.runSync(WriteTool),
  Effect.runSync(BashTool),
  Effect.runSync(GlobTool),
  Effect.runSync(GrepTool),
  Effect.runSync(WebFetchTool),
  Effect.runSync(WebSearchTool),
]

// All tools including those with Effect dependencies.
// Tools with deps are skipped by toAITools() but available via runtime.execute().
const allToolInfos: ReadonlyArray<Info<any>> = [
  ...eagerToolInfos,
  // Has Effect service deps — cannot be eagerly initialized
  TaskStatusTool,
  SkillTool,
]

export function getAllToolInfos(): ReadonlyArray<Info<any>> {
  return allToolInfos
}

export const ToolRuntimeLive = Layer.succeed(
  ToolRuntimeService,
  makeRuntime(allToolInfos),
)

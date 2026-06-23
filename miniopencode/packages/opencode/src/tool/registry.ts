import { Effect, Context, Layer } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { ToolRuntimeService, makeRuntime } from "./tool"
import type { Tool } from "./tool"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { BashTool } from "./bash"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"

const log = Log.create({ service: "tool.registry" })

const defaultTools: ReadonlyArray<Tool> = [
  ReadTool,
  WriteTool,
  BashTool,
  GlobTool,
  GrepTool,
]

export const ToolRuntimeLive = Layer.succeed(
  ToolRuntimeService,
  makeRuntime(defaultTools),
)

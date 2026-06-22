import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
import * as Tool from "./tool"
import { ReadTool } from "./read"
import { WriteTool } from "./write"
import { BashTool } from "./bash"
import { BuildFilesTool } from "./build_files"
const log = Log.create({ service: "tool.registry" })
export interface Interface { readonly ids: () => Effect.Effect<ReadonlyArray<string>, unknown, unknown>; readonly all: () => Effect.Effect<ReadonlyArray<Tool.Def>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/ToolRegistry") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const tools: Tool.Def[] = []
  for (const info of [ReadTool, WriteTool, BashTool, BuildFilesTool]) {
    const resolved = yield* (info as any)
    const def = yield* Tool.init(resolved) as any
    tools.push(def); log.info("registered tool", { id: def.id })
  }
  const ids = Effect.fn("ToolRegistry.ids")(function* () { return tools.map((t) => t.id) })
  const all = Effect.fn("ToolRegistry.all")(function* () { return tools })
  return Service.of({ ids, all } as any)
}))
export const defaultLayer = layer
export * as ToolRegistry from "./registry"

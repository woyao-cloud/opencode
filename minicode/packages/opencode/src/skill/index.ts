import { Context, Effect, Layer } from "effect"
import * as Log from "@minicode/core/util/log"
const log = Log.create({ service: "skill" })
export interface Interface { readonly dirs: () => Effect.Effect<ReadonlyArray<string>, unknown, unknown>; readonly list: () => Effect.Effect<ReadonlyArray<{ id: string; name: string }>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Skill") {}
export const layer = Layer.effect(Service, Effect.gen(function* () { log.info("skill layer initialized (no-op)"); const dirs = Effect.fn("Skill.dirs")(function* () { return [] as ReadonlyArray<string> }); const list = Effect.fn("Skill.list")(function* () { return [] as ReadonlyArray<{ id: string; name: string }> }); return Service.of({ dirs, list } as any) }))
export const defaultLayer = layer
export * as Skill from "."

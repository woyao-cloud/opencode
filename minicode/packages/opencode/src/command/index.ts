import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import * as InstanceState from "@/effect/instance-state"
const log = Log.create({ service: "command" })
export const Definition = Schema.Struct({ name: Schema.String, description: Schema.optional(Schema.String), template: Schema.String })
export type Definition = Schema.Schema.Type<typeof Definition>
export interface Interface { readonly list: () => Effect.Effect<ReadonlyArray<Definition>, unknown, unknown>; readonly get: (name: string) => Effect.Effect<Definition | undefined, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Command") {}
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* (InstanceState.make<ReadonlyArray<Definition>>(Effect.fn("Command.state")(function* () { log.info("command layer initialized (empty)"); return [] as ReadonlyArray<Definition> }) as any) as any)
  const list = Effect.fn("Command.list")(function* () { return yield* InstanceState.get(state) })
  const get = Effect.fn("Command.get")(function* (name: string) { const cmds = (yield* InstanceState.get(state)) as ReadonlyArray<Definition>; return cmds.find((c: any) => c.name === name) })
  return Service.of({ list, get } as any)
}))
export const defaultLayer = layer
export * as Command from "."

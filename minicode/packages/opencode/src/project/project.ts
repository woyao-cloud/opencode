import { Context, Effect, Layer, Schema } from "effect"
import * as Log from "@minicode/core/util/log"
import * as InstanceState from "@/effect/instance-state"
import { InstanceRef, type InstanceContext } from "@/effect/instance-ref"
import { Git } from "@/git"
const log = Log.create({ service: "project" })
export const ProjectID = Schema.String.pipe(Schema.brand("ProjectID"))
export type ProjectID = Schema.Schema.Type<typeof ProjectID>
export const Info = Schema.Struct({ id: ProjectID, name: Schema.String, directory: Schema.String, worktree: Schema.String })
export type Info = Schema.Schema.Type<typeof Info>
export interface Interface { readonly current: () => Effect.Effect<Info, unknown, unknown>; readonly list: () => Effect.Effect<ReadonlyArray<Info>, unknown, unknown> }
export class Service extends Context.Service<Service, Interface>()("@minicode/Project") {}
function makeProjectID(dir: string): ProjectID { return ProjectID.make(dir.replace(/[^a-zA-Z0-9]/g, "_").slice(-64)) }
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const state = yield* (InstanceState.make<Info>(Effect.fn("Project.state")(function* (ctx: any) {
    log.info("project init", { directory: ctx.directory })
    const worktree = yield* Git.root(ctx.directory).pipe(Effect.catch(() => Effect.succeed("/")))
    return { id: makeProjectID(ctx.directory), name: ctx.directory.split("/").pop() ?? ctx.directory, directory: ctx.directory, worktree } as Info
  }) as any) as any)
  const current = Effect.fn("Project.current")(function* () { return yield* InstanceState.get(state) })
  const list = Effect.fn("Project.list")(function* () { const info = (yield* InstanceState.get(state)) as Info; return [info] })
  return Service.of({ current, list } as any)
}))
export const defaultLayer = layer
export * as Project from "."

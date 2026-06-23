import { Layer, ManagedRuntime, Effect } from "effect"
import * as Log from "@minicode/core/util/log"
import { Global } from "@minicode/core/global"
import { Env } from "@/env"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { InstanceLayer } from "@/project/bootstrap"
const log = Log.create({ service: "bootstrap" })

// Provide InstanceRef and WorkspaceRef into InstanceLayer's dependencies.
const refLayer = Layer.succeed(InstanceRef as any, { directory: process.cwd(), worktree: "/" } as any)
const wsLayer = Layer.succeed(WorkspaceRef as any, "/" as any)
const allRefs = Layer.mergeAll(refLayer as any, wsLayer as any)
export const AppLayer = (InstanceLayer as any).pipe(Layer.provideMerge(allRefs as any)) as Layer.Layer<any>
const rt = ManagedRuntime.make(AppLayer as any)
export const AppRuntime = {
  runSync: (effect: any) => rt.runSync(effect),
  runPromise: (effect: any, options?: any) => rt.runPromise(effect, options),
  runPromiseExit: (effect: any, options?: any) => rt.runPromiseExit(effect, options),
  runFork: (effect: any) => rt.runFork(effect),
  runCallback: (effect: any) => rt.runCallback(effect),
  dispose: () => rt.dispose(),
}
export async function init() { await Log.init({ print: Env.MINICODE_LOG_PRINT, level: Env.MINICODE_LOG_LEVEL }); log.info("minicode initialized", { home: Global.Path.home }) }
export * as Bootstrap from "./bootstrap"

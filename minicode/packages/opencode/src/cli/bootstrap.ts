import { Layer, ManagedRuntime } from "effect"
import * as Log from "@minicode/core/util/log"
import { Global } from "@minicode/core/global"
import { Env } from "@/env"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceLayer, DefaultInstanceRef } from "@/project/bootstrap"
const log = Log.create({ service: "bootstrap" })
export const AppLayer = Layer.provideMerge(InstanceLayer as any, DefaultInstanceRef as any) as Layer.Layer<any>
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

import { Layer, ManagedRuntime } from "effect"
import * as Log from "@miniopencode/core/util/log"
import { Global } from "@miniopencode/core/global"
import { Env } from "@/env"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { InstanceLayer } from "@/project/bootstrap"

const log = Log.create({ service: "bootstrap" })

// Dynamic layers: these vary per CLI invocation (working directory, etc.)
const refLayer = Layer.succeed(InstanceRef, { directory: process.cwd(), worktree: "/" })
const wsLayer = Layer.succeed(WorkspaceRef, "/")

// Merge dynamic layers with the pre-computed service layer.
// InstanceLayer provides all business services via Layer.succeed, so
// Layer.mergeAll resolves cleanly — no Layer.provide needed.
export const AppLayer = Layer.mergeAll(refLayer, wsLayer, InstanceLayer)

const rt = ManagedRuntime.make(AppLayer)

export const AppRuntime = {
  runSync: <A>(effect: any) => rt.runSync(effect) as A,
  runPromise: (effect: any, options?: any) => rt.runPromise(effect, options),
  runPromiseExit: (effect: any, options?: any) => rt.runPromiseExit(effect, options),
  runFork: (effect: any) => rt.runFork(effect),
  runCallback: (effect: any) => rt.runCallback(effect),
  dispose: () => rt.dispose(),
}

export async function init() {
  await Log.init({ print: Env.MINICODE_LOG_PRINT, level: Env.MINICODE_LOG_LEVEL })
  log.info("miniopencode initialized", { home: Global.Path.home })
}

export * as Bootstrap from "./bootstrap"

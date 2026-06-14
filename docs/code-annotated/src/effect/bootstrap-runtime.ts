/**
 * [effect/bootstrap-runtime] - 启动运行时组装模块
 *
 * 功能概述：
 * - 组装应用启动所需的所有默认 Layer（插件、LSP、文件系统、Git、快照等）
 * - 创建全局 BootstrapRuntime 单例
 *
 * 核心导出：
 * - BootstrapRuntime：启动运行时单例
 *
 * 架构位置：上游依赖各业务模块的 defaultLayer；下游被应用入口引用
 */
import { Layer, ManagedRuntime } from "effect"

import { Plugin } from "@/plugin"
import { LSP } from "@/lsp/lsp"
import { FileWatcher } from "@/file/watcher"
import { Format } from "@/format"
import { ShareNext } from "@/share/share-next"
import { File } from "@/file"
import { Vcs } from "@/project/vcs"
import { Snapshot } from "@/snapshot"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import * as Observability from "@opencode-ai/core/effect/observability"
import { memoMap } from "@opencode-ai/core/effect/memo-map"

export const BootstrapLayer = Layer.mergeAll(
  Config.defaultLayer,
  Plugin.defaultLayer,
  ShareNext.defaultLayer,
  Format.defaultLayer,
  LSP.defaultLayer,
  File.defaultLayer,
  FileWatcher.defaultLayer,
  Vcs.defaultLayer,
  Snapshot.defaultLayer,
  Bus.defaultLayer,
).pipe(Layer.provide(Observability.layer))

export const BootstrapRuntime = ManagedRuntime.make(BootstrapLayer, { memoMap })

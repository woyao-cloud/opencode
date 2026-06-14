/**
 * effect/app-runtime - Effect-TS 应用运行时：组装所有依赖 Layer 并创建 ManagedRuntime
 *
 * 功能概述：
 * - 组装完整的依赖注入 Layer 图（所有服务的 Layer 合并）
 * - 创建 ManagedRuntime：Effect 系统的运行时入口
 * - 集成 OpenTelemetry 可观测性
 * - 提供 runService 桥接：在非 Effect 上下文中执行 Effect
 *
 * 核心导出：
 * - 完整的 Layer 组合
 * - ManagedRuntime 实例
 *
 * 架构位置：Effect-TS 运行时层，是 opencode 进程启动时的初始化入口。
 * 上游依赖：所有服务的 Layer 定义
 * 下游消费：CLI 入口、Server 入口
 */

import { Layer, ManagedRuntime } from "effect"
import { attach } from "./run-service"
import * as Observability from "@opencode-ai/core/effect/observability"

import { AppFileSystem } from "@opencode-ai/core/filesystem"
import { Bus } from "@/bus"
import { Auth } from "@/auth"
import { Account } from "@/account/account"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Ripgrep } from "@/file/ripgrep"
import { File } from "@/file"
import { FileWatcher } from "@/file/watcher"
import { Storage } from "@/storage/storage"
import { Snapshot } from "@/snapshot"
import { Plugin } from "@/plugin"
import { ModelsDev } from "@opencode-ai/core/models"
import { Provider } from "@/provider/provider"
import { ProviderAuth } from "@/provider/auth"
import { Agent } from "@/agent/agent"
import { Skill } from "@/skill"
import { Discovery } from "@/skill/discovery"
import { Question } from "@/question"
import { Permission } from "@/permission"
import { Todo } from "@/session/todo"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { SessionRunState } from "@/session/run-state"
import { SessionProcessor } from "@/session/processor"
import { SessionCompaction } from "@/session/compaction"
import { SessionRevert } from "@/session/revert"
import { SessionSummary } from "@/session/summary"
import { SessionPrompt } from "@/session/prompt"
import { Instruction } from "@/session/instruction"
import { LLM } from "@/session/llm"
import { LSP } from "@/lsp/lsp"
import { MCP } from "@/mcp"
import { McpAuth } from "@/mcp/auth"
import { Command } from "@/command"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { Format } from "@/format"
import { InstanceLayer } from "@/project/instance-layer"
import { Project } from "@/project/project"
import { Vcs } from "@/project/vcs"
import { Reference } from "@/reference/reference"
import { Workspace } from "@/control-plane/workspace"
import { Worktree } from "@/worktree"
import { Pty } from "@/pty"
import { PtyTicket } from "@/pty/ticket"
import { Installation } from "@/installation"
import { ShareNext } from "@/share/share-next"
import { SessionShare } from "@/share/session"
import { SyncEvent } from "@/sync"
import { Npm } from "@opencode-ai/core/npm"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import { DataMigration } from "@/data-migration"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"

export const AppLayer = Layer.mergeAll(
  Npm.defaultLayer,
  AppFileSystem.defaultLayer,
  Bus.defaultLayer,
  Auth.defaultLayer,
  Account.defaultLayer,
  Config.defaultLayer,
  Git.defaultLayer,
  Ripgrep.defaultLayer,
  File.defaultLayer,
  FileWatcher.defaultLayer,
  Storage.defaultLayer,
  Snapshot.defaultLayer,
  Plugin.defaultLayer,
  ModelsDev.defaultLayer,
  Provider.defaultLayer,
  ProviderAuth.defaultLayer,
  Agent.defaultLayer,
  Skill.defaultLayer,
  Discovery.defaultLayer,
  Question.defaultLayer,
  Permission.defaultLayer,
  Todo.defaultLayer,
  Session.defaultLayer,
  SessionStatus.defaultLayer,
  BackgroundJob.defaultLayer,
  RuntimeFlags.defaultLayer,
  SessionRunState.defaultLayer,
  SessionProcessor.defaultLayer,
  SessionCompaction.defaultLayer,
  SessionRevert.defaultLayer,
  SessionSummary.defaultLayer,
  SessionPrompt.defaultLayer,
  Instruction.defaultLayer,
  LLM.defaultLayer,
  LSP.defaultLayer,
  MCP.defaultLayer,
  McpAuth.defaultLayer,
  Command.defaultLayer,
  Truncate.defaultLayer,
  ToolRegistry.defaultLayer,
  Format.defaultLayer,
  Project.defaultLayer,
  Vcs.defaultLayer,
  Reference.defaultLayer,
  Workspace.defaultLayer,
  Worktree.appLayer,
  Pty.defaultLayer,
  PtyTicket.defaultLayer,
  Installation.defaultLayer,
  ShareNext.defaultLayer,
  SessionShare.defaultLayer,
  SyncEvent.defaultLayer,
  EventV2Bridge.defaultLayer,
  DataMigration.defaultLayer,
).pipe(Layer.provideMerge(InstanceLayer.layer), Layer.provideMerge(Observability.layer))

const rt = ManagedRuntime.make(AppLayer, { memoMap })
type Runtime = Pick<typeof rt, "runSync" | "runPromise" | "runPromiseExit" | "runFork" | "runCallback" | "dispose">

/** Services provided by AppRuntime — i.e. what an Effect run via AppRuntime.runPromise can yield. */
export type AppServices = ManagedRuntime.ManagedRuntime.Services<typeof rt>
const wrap = (effect: Parameters<typeof rt.runSync>[0]) => attach(effect as never) as never

export const AppRuntime: Runtime = {
  runSync(effect) {
    return rt.runSync(wrap(effect))
  },
  runPromise(effect, options) {
    return rt.runPromise(wrap(effect), options)
  },
  runPromiseExit(effect, options) {
    return rt.runPromiseExit(wrap(effect), options)
  },
  runFork(effect) {
    return rt.runFork(wrap(effect))
  },
  runCallback(effect) {
    return rt.runCallback(wrap(effect))
  },
  dispose: () => rt.dispose(),
}

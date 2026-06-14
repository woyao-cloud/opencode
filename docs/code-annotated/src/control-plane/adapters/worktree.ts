/**
 * [control-plane/adapters/worktree] - Git Worktree 工作区适配器
 * 功能概述：创建和管理 Git worktree 类型的工作区，提供 target、configure、create、remove 操作
 * 核心导出：WorktreeAdapter
 * 架构位置：adapter layer，被 adapters/index 注册，依赖 effect/instance-ref 和 types
 */

import { Effect, Schema } from "effect"
import { InstanceRef, WorkspaceRef } from "@/effect/instance-ref"
import { type WorkspaceAdapter, type WorkspaceAdapterContext, WorkspaceInfo } from "../types"

const WorktreeConfig = Schema.Struct({
  name: WorkspaceInfo.fields.name,
  branch: Schema.optional(Schema.NullOr(Schema.String)),
  directory: Schema.String,
})
const decodeWorktreeConfig = Schema.decodeUnknownSync(WorktreeConfig)

async function loadWorktree() {
  const [{ AppRuntime }, { Worktree }] = await Promise.all([import("@/effect/app-runtime"), import("@/worktree")])
  return { AppRuntime, Worktree }
}

function requireInstance(context: WorkspaceAdapterContext | undefined) {
  if (!context?.instance) throw new Error("Worktree adapter requires an instance context")
  return context.instance
}

const provideContext = <A, E, R>(effect: Effect.Effect<A, E, R>, context: WorkspaceAdapterContext | undefined) =>
  effect.pipe(
    Effect.provideService(InstanceRef, requireInstance(context)),
    Effect.provideService(WorkspaceRef, context?.workspaceID),
  )

export const WorktreeAdapter: WorkspaceAdapter = {
  name: "Worktree",
  description: "Create a git worktree",
  async configure(info, context) {
    const { AppRuntime, Worktree } = await loadWorktree()
    const next = await AppRuntime.runPromise(
      provideContext(
        Worktree.Service.use((svc) => svc.makeWorktreeInfo({ detached: true })),
        context,
      ),
    )
    return {
      ...info,
      name: next.name,
      directory: next.directory,
    }
  },
  async create(info, _env, _from, context) {
    const { AppRuntime, Worktree } = await loadWorktree()
    const config = decodeWorktreeConfig(info)
    await AppRuntime.runPromise(
      provideContext(
        Worktree.Service.use((svc) =>
          svc.createFromInfo({
            name: config.name,
            directory: config.directory,
            ...(config.branch ? { branch: config.branch } : {}),
          }),
        ),
        context,
      ),
    )
  },
  async list(context) {
    const { AppRuntime, Worktree } = await loadWorktree()
    const ctx = requireInstance(context)
    return (
      await AppRuntime.runPromise(
        provideContext(
          Worktree.Service.use((svc) => svc.list()),
          context,
        ),
      )
    ).map((info) => ({
      type: "worktree",
      name: info.name,
      branch: info.branch,
      directory: info.directory,
      projectID: ctx.project.id,
    }))
  },
  async remove(info, context) {
    const { AppRuntime, Worktree } = await loadWorktree()
    const config = decodeWorktreeConfig(info)
    await AppRuntime.runPromise(
      provideContext(
        Worktree.Service.use((svc) => svc.remove({ directory: config.directory })),
        context,
      ),
    )
  },
  target(info) {
    const config = decodeWorktreeConfig(info)
    return {
      type: "local",
      directory: config.directory,
    }
  },
}

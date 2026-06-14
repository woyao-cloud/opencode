/**
 * [control-plane/workspace-context] - 工作区上下文
 * 功能概述：基于 LocalContext 提供当前工作区 ID 的异步上下文传递
 * 核心导出：WorkspaceContext
 * 架构位置：context layer，被上层模块用于获取当前工作区 ID
 */

import { LocalContext } from "@/util/local-context"
import type { WorkspaceID } from "../control-plane/schema"

export interface WorkspaceContext {
  workspaceID: WorkspaceID | undefined
}

const context = LocalContext.create<WorkspaceContext>("instance")

export const WorkspaceContext = {
  async provide<R>(input: { workspaceID?: WorkspaceID; fn: () => R }): Promise<R> {
    return context.provide({ workspaceID: input.workspaceID }, () => input.fn())
  },

  restore<R>(workspaceID: WorkspaceID, fn: () => R): R {
    return context.provide({ workspaceID }, fn)
  },

  get workspaceID() {
    try {
      return context.use().workspaceID
    } catch {
      return undefined
    }
  },
}

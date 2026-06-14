/**
 * project/instance-context - 实例上下文：定义项目实例的运行时上下文
 *
 * 功能概述：
 * - 定义 InstanceContext 接口（工作目录、仓库根目录、项目信息）
 * - 提供 LocalContext 用于上下文传播
 * - 提供路径边界检查工具函数
 *
 * 核心导出：
 * - InstanceContext：实例上下文接口
 * - context：LocalContext 实例
 * - containsPath：路径边界检查
 *
 * 架构位置：Project 模块上下文层，被整个 opencode 引用以获取当前实例信息。
 */
import { LocalContext } from "@/util/local-context"
import { AppFileSystem } from "@opencode-ai/core/filesystem"
import type * as Project from "./project"

export interface InstanceContext {
  directory: string
  worktree: string
  project: Project.Info
}

export const context = LocalContext.create<InstanceContext>("instance")

/**
 * Check if a path is within the project boundary.
 * Returns true if path is inside ctx.directory OR ctx.worktree.
 * Paths within the worktree but outside the working directory should not trigger external_directory permission.
 */
export function containsPath(filepath: string, ctx: InstanceContext): boolean {
  if (AppFileSystem.contains(ctx.directory, filepath)) return true
  // Non-git projects set worktree to "/" which would match ANY absolute path.
  // Skip worktree check in this case to preserve external_directory permissions.
  if (ctx.worktree === "/") return false
  return AppFileSystem.contains(ctx.worktree, filepath)
}

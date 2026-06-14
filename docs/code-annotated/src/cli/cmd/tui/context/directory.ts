/**
 * cli/cmd/tui/context/directory - 目录上下文 Hook
 *
 * 功能概述：
 * - 提供当前工作目录信息的响应式 Hook
 *
 * 核心导出：
 * - useDirectory(): 返回当前目录信息的 Hook
 *
 * 架构位置：TUI 上下文层，被各组件用于获取工作目录信息
 */

import { createMemo } from "solid-js"
import { useProject } from "./project"
import { useSync } from "./sync"
import { Global } from "@opencode-ai/core/global"

export function useDirectory() {
  const project = useProject()
  const sync = useSync()
  return createMemo(() => {
    const directory = project.instance.path().directory || process.cwd()
    const result = directory.replace(Global.Path.home, "~")
    if (sync.data.vcs?.branch) return result + ":" + sync.data.vcs.branch
    return result
  })
}

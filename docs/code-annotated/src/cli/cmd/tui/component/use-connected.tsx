/**
 * cli/cmd/tui/component/use-connected - 连接状态检测 Hook
 *
 * 功能概述：
 * - SolidJS 响应式 Hook，检测是否已连接到至少一个有效模型提供商
 *
 * 核心导出：
 * - useConnected(): 返回连接状态的计算信号
 *
 * 架构位置：TUI 组件层，被 app.tsx 等用于判断是否显示连接状态
 */

import { createMemo } from "solid-js"
import { useSync } from "@tui/context/sync"

export function useConnected() {
  const sync = useSync()
  return createMemo(() =>
    sync.data.provider.some((x) => x.id !== "opencode" || Object.values(x.models).some((y) => y.cost?.input !== 0)),
  )
}

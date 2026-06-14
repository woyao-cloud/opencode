/**
 * cli/cmd/tui/component/workspace-label - 工作区标签组件
 *
 * 功能概述：
 * - 渲染工作区状态标签，显示连接状态和类型
 * - 支持 connected / connecting / disconnected / error 四种状态
 *
 * 核心导出：
 * - WorkspaceLabel: SolidJS 组件
 *
 * 架构位置：TUI 组件层，被工作区相关对话框和侧边栏引用
 */

import { useTheme } from "@tui/context/theme"

export type WorkspaceStatus = "connected" | "connecting" | "disconnected" | "error"

export function WorkspaceLabel(props: { type: string; name: string; status?: WorkspaceStatus; icon?: boolean }) {
  const { theme } = useTheme()
  const color = () => {
    if (props.status === "connected") return theme.success
    if (props.status === "error") return theme.error
    return theme.textMuted
  }

  return (
    <>
      {props.icon ? <span style={{ fg: color() }}>● </span> : undefined}
      <span style={{ fg: theme.text }}>{props.name}</span> <span style={{ fg: theme.textMuted }}>({props.type})</span>
    </>
  )
}

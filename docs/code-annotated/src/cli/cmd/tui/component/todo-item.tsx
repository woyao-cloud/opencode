/**
 * cli/cmd/tui/component/todo-item - 待办事项组件
 *
 * 功能概述：
 * - 渲染单个待办事项条目，包含状态和内容
 *
 * 核心导出：
 * - TodoItem: SolidJS 组件
 *
 * 架构位置：TUI 组件层，被 sidebar/todo 等功能组件引用
 */

import { useTheme } from "../context/theme"

export interface TodoItemProps {
  status: string
  content: string
}

export function TodoItem(props: TodoItemProps) {
  const { theme } = useTheme()

  return (
    <box flexDirection="row" gap={0}>
      <text
        flexShrink={0}
        style={{
          fg: props.status === "in_progress" ? theme.warning : theme.textMuted,
        }}
      >
        [{props.status === "completed" ? "✓" : props.status === "in_progress" ? "•" : " "}]{" "}
      </text>
      <text
        flexGrow={1}
        wrapMode="word"
        style={{
          fg: props.status === "in_progress" ? theme.warning : theme.textMuted,
        }}
      >
        {props.content}
      </text>
    </box>
  )
}

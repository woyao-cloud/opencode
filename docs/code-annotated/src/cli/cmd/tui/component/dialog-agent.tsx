/**
 * cli/cmd/tui/component/dialog-agent - 代理选择对话框
 *
 * 功能概述：
 * - 提供 TUI 代理选择对话框组件
 * - 列出可用代理并支持选择切换
 *
 * 核心导出：
 * - DialogAgent: SolidJS 代理选择对话框组件
 *
 * 架构位置：TUI 组件
 */
import { createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()

  const options = createMemo(() =>
    local.agent.list().map((item) => {
      return {
        value: item.name,
        title: item.name,
        description: item.native ? "native" : item.description,
      }
    }),
  )

  return (
    <DialogSelect
      title="Select agent"
      current={local.agent.current()?.name}
      options={options()}
      onSelect={(option) => {
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}

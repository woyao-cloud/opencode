/**
 * cli/cmd/tui/component/dialog-variant - 变体选择对话框
 *
 * 功能概述：
 * - 提供 TUI 模型变体选择对话框组件
 * - 列出可用变体（如 default、long-context）并支持选择切换
 *
 * 核心导出：
 * - DialogVariant: SolidJS 变体选择对话框组件
 *
 * 架构位置：TUI 组件
 */
import { createMemo } from "solid-js"
import { useLocal } from "@tui/context/local"
import { DialogSelect } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"

export function DialogVariant() {
  const local = useLocal()
  const dialog = useDialog()

  const options = createMemo(() => {
    return [
      {
        value: "default",
        title: "Default",
        onSelect: () => {
          dialog.clear()
          local.model.variant.set(undefined)
        },
      },
      ...local.model.variant.list().map((variant) => ({
        value: variant,
        title: variant,
        onSelect: () => {
          dialog.clear()
          local.model.variant.set(variant)
        },
      })),
    ]
  })

  return (
    <DialogSelect<string>
      options={options()}
      title={"Select variant"}
      current={local.model.variant.selected()}
      flat={true}
    />
  )
}

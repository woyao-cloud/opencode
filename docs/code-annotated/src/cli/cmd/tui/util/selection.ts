/**
 * cli/cmd/tui/util/selection.ts - 选择文本工具
 * 功能概述：处理 TUI 中的文本选择复制和键盘事件
 * 核心导出：copy, handleSelectionKey
 * 架构位置：TUI 组件
 */
import * as Clipboard from "./clipboard"

type Toast = {
  show: (input: { message: string; variant: "info" | "success" | "warning" | "error" }) => void
  error: (err: unknown) => void
}

type FocusableSelectionTarget = {
  hasSelection: () => boolean
}

type Renderer = {
  getSelection: () => { getSelectedText: () => string; selectedRenderables: FocusableSelectionTarget[] } | null
  clearSelection: () => void
  currentFocusedRenderable?: FocusableSelectionTarget | null
}

type SelectionKeyEvent = {
  ctrl?: boolean
  name: string
  preventDefault: () => void
  stopPropagation: () => void
}

export function copy(renderer: Renderer, toast: Toast): boolean {
  const text = renderer.getSelection()?.getSelectedText()
  if (!text) return false

  Clipboard.copy(text)
    .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }))
    .catch(toast.error)

  renderer.clearSelection()
  return true
}

export function handleSelectionKey(renderer: Renderer, toast: Toast, event: SelectionKeyEvent) {
  const selection = renderer.getSelection()
  if (!selection) return

  if (event.ctrl && event.name === "c") {
    if (!copy(renderer, toast)) {
      renderer.clearSelection()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (event.name === "escape") {
    renderer.clearSelection()
    event.preventDefault()
    event.stopPropagation()
    return
  }

  const focus = renderer.currentFocusedRenderable
  if (focus?.hasSelection() && selection.selectedRenderables.includes(focus)) return

  renderer.clearSelection()
}

export * as Selection from "./selection"

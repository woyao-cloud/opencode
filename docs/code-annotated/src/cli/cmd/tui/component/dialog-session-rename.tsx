/**
 * cli/cmd/tui/component/dialog-session-rename - 会话重命名对话框
 *
 * 功能概述：
 * - 提供 TUI 会话重命名对话框组件
 * - 支持用户输入新的会话名称
 *
 * 核心导出：
 * - DialogSessionRename: SolidJS 会话重命名对话框组件
 *
 * 架构位置：TUI 组件
 */
import { DialogPrompt } from "@tui/ui/dialog-prompt"
import { useDialog } from "@tui/ui/dialog"
import { useSync } from "@tui/context/sync"
import { createMemo } from "solid-js"
import { useSDK } from "../context/sdk"

interface DialogSessionRenameProps {
  session: string
}

export function DialogSessionRename(props: DialogSessionRenameProps) {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const session = createMemo(() => sync.session.get(props.session))

  return (
    <DialogPrompt
      title="Rename Session"
      value={session()?.title}
      onConfirm={(value) => {
        void sdk.client.session.update({
          sessionID: props.session,
          title: value,
        })
        dialog.clear()
      }}
      onCancel={() => dialog.clear()}
    />
  )
}

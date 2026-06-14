/**
 * cli/cmd/tui/routes/session/dialog-subagent - 子代理操作对话框
 * 功能概述：提供对子代理会话的操作（如打开子代理会话）
 * 核心导出：DialogSubagent
 * 架构位置：TUI 路由页面
 */

import { DialogSelect } from "@tui/ui/dialog-select"
import { useRoute } from "@tui/context/route"

export function DialogSubagent(props: { sessionID: string }) {
  const route = useRoute()

  return (
    <DialogSelect
      title="Subagent Actions"
      options={[
        {
          title: "Open",
          value: "subagent.view",
          description: "the subagent's session",
          onSelect: (dialog) => {
            route.navigate({
              type: "session",
              sessionID: props.sessionID,
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}

/**
 * cli/cmd/tui/context/prompt - 提示引用上下文
 * 功能概述：- 提供 PromptRef 引用管理，用于跨组件共享当前提示引用
 * 核心导出：- PromptRefProvider / usePromptRef: 提示引用上下文提供者与 Hook
 * 架构位置：TUI 上下文层
 */
import { createSimpleContext } from "./helper"
import type { PromptRef } from "../component/prompt"

export const { use: usePromptRef, provider: PromptRefProvider } = createSimpleContext({
  name: "PromptRef",
  init: () => {
    let current: PromptRef | undefined

    return {
      get current() {
        return current
      },
      set(ref: PromptRef | undefined) {
        current = ref
      },
    }
  },
})

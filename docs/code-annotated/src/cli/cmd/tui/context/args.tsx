/**
 * cli/cmd/tui/context/args - 启动参数上下文
 *
 * 功能概述：
 * - 定义 TUI 启动时传递的参数类型和上下文
 *
 * 核心导出：
 * - Args: 启动参数接口
 *
 * 架构位置：TUI 上下文层，被 app.tsx 等用于读取启动参数
 */

import { createSimpleContext } from "./helper"

export interface Args {
  model?: string
  agent?: string
  prompt?: string
  continue?: boolean
  sessionID?: string
  fork?: boolean
}

export const { use: useArgs, provider: ArgsProvider } = createSimpleContext({
  name: "Args",
  init: (props: Args) => props,
})

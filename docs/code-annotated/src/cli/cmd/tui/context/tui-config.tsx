/**
 * cli/cmd/tui/context/tui-config - TUI 配置上下文
 * 功能概述：- 提供 TUI 配置对象的上下文共享
 * 核心导出：- TuiConfigProvider / useTuiConfig: TUI 配置上下文提供者与 Hook
 * 架构位置：TUI 上下文层
 */
import { TuiConfig } from "@/cli/cmd/tui/config/tui"
import { createSimpleContext } from "./helper"

export const { use: useTuiConfig, provider: TuiConfigProvider } = createSimpleContext({
  name: "TuiConfig",
  init: (props: { config: TuiConfig.Resolved }) => {
    return props.config
  },
})

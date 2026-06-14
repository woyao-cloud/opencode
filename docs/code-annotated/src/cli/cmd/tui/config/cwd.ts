/**
 * cli/cmd/tui/config/cwd - 当前工作目录上下文引用
 *
 * 功能概述：
 * - 定义 Effect Context Reference 用于注入当前工作目录
 *
 * 核心导出：
 * - CurrentWorkingDirectory: Effect Context.Reference<string>
 *
 * 架构位置：TUI 配置层，被 TUI 各模块用于获取当前工作目录
 */

import { Context } from "effect"

export const CurrentWorkingDirectory = Context.Reference<string>("CurrentWorkingDirectory", {
  defaultValue: () => process.cwd(),
})

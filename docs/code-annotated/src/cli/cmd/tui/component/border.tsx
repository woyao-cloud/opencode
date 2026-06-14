/**
 * cli/cmd/tui/component/border - 边框样式定义
 *
 * 功能概述：
 * - 定义终端 UI 边框字符常量
 * - 提供 EmptyBorder（空格边框）等预设样式
 *
 * 核心导出：
 * - EmptyBorder: 空边框样式对象
 *
 * 架构位置：TUI 组件层，被其他 UI 组件用于边框渲染
 */

export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
}

export const SplitBorder = {
  border: ["left" as const, "right" as const],
  customBorderChars: {
    ...EmptyBorder,
    vertical: "┃",
  },
}

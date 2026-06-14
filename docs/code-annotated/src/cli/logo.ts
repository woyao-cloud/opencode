/**
 * cli/logo - ASCII logo 字符画数据
 *
 * 功能概述：
 * - 定义 opencode 终端 ASCII logo 字符画
 * - 包含 logo、go 和 marks 三组字符画常量
 *
 * 核心导出：
 * - logo: 主 logo 字符画（左右两部分）
 * - go: "go" 提示字符画
 * - marks: 标记字符集合
 *
 * 架构位置：CLI 层 UI 数据模块，被 cli/ui.ts 引用用于渲染 logo
 */

export const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"

/**
 * cli/cmd/tui/context/path-format - 路径格式化上下文
 * 功能概述：- 提供路径格式化工具，将绝对路径转为相对路径或用户目录简写
 * 核心导出：- PathFormatterProvider / usePathFormatter: 路径格式化上下文提供者与 Hook
 * 架构位置：TUI 上下文层
 */
import path from "path"
import { createContext, useContext, type ParentProps } from "solid-js"
import { Global } from "@opencode-ai/core/global"

const context = createContext<{
  path: () => string
  format: (input?: string) => string
}>()

export function PathFormatterProvider(props: ParentProps<{ path: string | undefined }>) {
  return (
    <context.Provider
      value={{ path: () => props.path || process.cwd(), format: (input) => formatPath(input, props.path) }}
    >
      {props.children}
    </context.Provider>
  )
}

export function usePathFormatter() {
  const value = useContext(context)
  if (!value) throw new Error("PathFormatter context must be used within a PathFormatterProvider")
  return value
}

function formatPath(input: string | undefined, base: string | undefined) {
  if (!input) return ""

  const root = base || process.cwd()
  const absolute = path.isAbsolute(input) ? input : path.resolve(root, input)
  const relative = path.relative(root, absolute)

  if (!relative) return "."
  if (relative !== ".." && !relative.startsWith(".." + path.sep)) return relative
  if (Global.Path.home && (absolute === Global.Path.home || absolute.startsWith(Global.Path.home + path.sep))) {
    return absolute.replace(Global.Path.home, "~")
  }
  return absolute
}

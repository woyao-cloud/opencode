/**
 * lsp/diagnostic - LSP 诊断格式化：将诊断结果格式化为人类可读的文本报告
 *
 * 功能概述：
 * - 将 LSP 诊断对象格式化为 "ERROR [行:列] 消息" 格式的文本
 * - 按文件生成诊断报告，限制每文件最大输出条数
 *
 * 核心导出：
 * - pretty：格式化单条诊断
 * - report：生成文件诊断报告字符串
 *
 * 架构位置：LSP 模块工具层，被外部调用以展示诊断结果。
 * 上游依赖：lsp/client（LSP 客户端诊断类型）
 */
import * as LSPClient from "./client"

const MAX_PER_FILE = 20

export function pretty(diagnostic: LSPClient.Diagnostic) {
  const severityMap = {
    1: "ERROR",
    2: "WARN",
    3: "INFO",
    4: "HINT",
  }

  const severity = severityMap[diagnostic.severity || 1]
  const line = diagnostic.range.start.line + 1
  const col = diagnostic.range.start.character + 1

  return `${severity} [${line}:${col}] ${diagnostic.message}`
}

export function report(file: string, issues: LSPClient.Diagnostic[]) {
  const errors = issues.filter((item) => item.severity === 1)
  if (errors.length === 0) return ""
  const limited = errors.slice(0, MAX_PER_FILE)
  const more = errors.length - MAX_PER_FILE
  const suffix = more > 0 ? `\n... and ${more} more` : ""
  return `<diagnostics file="${file}">\n${limited.map(pretty).join("\n")}${suffix}\n</diagnostics>`
}

export * as Diagnostic from "./diagnostic"

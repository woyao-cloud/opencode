/**
 * tool/shell/id - Shell 类型标识符
 *
 * 功能概述：
 * - 定义支持的 Shell 类型（bash、pwsh、powershell、cmd）
 * - 提供类型转换和工具 ID 定义
 *
 * 核心导出：
 * - Kind：Shell 类型联合类型
 * - ToolID：工具 ID 常量（"bash"）
 * - toKind：字符串转 Shell 类型
 *
 * 架构位置：工具系统实现层，被 tool/shell.ts 和 tool/shell/prompt.ts 引用
 */
const kinds = ["bash", "pwsh", "powershell", "cmd"] as const
export type Kind = (typeof kinds)[number]

const shellKinds = new Set<string>(kinds)

function isKind(value: string): value is Kind {
  return shellKinds.has(value)
}

export function toKind(value: string): Kind {
  return isKind(value) ? value : "bash"
}

// Keep the exposed tool ID and permission key as "bash" for compatibility with
// existing plugins, users, and saved permissions. Rename with opencode 2.0.
export const ToolID = "bash"
export type ToolID = typeof ToolID

export * as ShellID from "./id"

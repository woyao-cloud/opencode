/**
 * lsp/launch - LSP 服务器进程启动：创建 LSP 服务器子进程
 *
 * 功能概述：
 * - 封装 LSP 服务器的进程创建逻辑
 * - 确保标准输入/输出/错误流都通过管道连接
 *
 * 核心导出：
 * - spawn：启动 LSP 服务器子进程
 *
 * 架构位置：LSP 模块底层工具，被 lsp/server.ts 中各个服务器定义使用。
 * 上游依赖：util/process（进程管理）
 */
import type { ChildProcessWithoutNullStreams } from "child_process"
import { Process } from "@/util/process"

type Child = Process.Child & ChildProcessWithoutNullStreams

export function spawn(cmd: string, args: string[], opts?: Process.Options): Child
export function spawn(cmd: string, opts?: Process.Options): Child
export function spawn(cmd: string, argsOrOpts?: string[] | Process.Options, opts?: Process.Options) {
  const args = Array.isArray(argsOrOpts) ? [...argsOrOpts] : []
  const cfg = Array.isArray(argsOrOpts) ? opts : argsOrOpts
  const proc = Process.spawn([cmd, ...args], {
    ...cfg,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  }) as Child

  if (!proc.stdin || !proc.stdout || !proc.stderr) throw new Error("Process output not available")

  return proc
}

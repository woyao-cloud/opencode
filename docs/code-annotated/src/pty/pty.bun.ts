/**
 * pty/pty.bun - Bun PTY 实现：使用 bun-pty 库创建伪终端
 *
 * 功能概述：
 * - Bun 运行时的 PTY 实现
 * - 封装 bun-pty 库的 spawn、onData、onExit 接口
 *
 * 核心导出：
 * - spawn：创建 PTY 进程
 *
 * 架构位置：PTY 模块平台适配层，Bun 运行时专用。
 * 上游依赖：pty/pty（PTY 类型定义）
 */
import { spawn as create } from "bun-pty"
import type { Opts, Proc } from "./pty"

export type { Disp, Exit, Opts, Proc } from "./pty"

export function spawn(file: string, args: string[], opts: Opts): Proc {
  const pty = create(file, args, opts)
  return {
    pid: pty.pid,
    onData(listener) {
      return pty.onData(listener)
    },
    onExit(listener) {
      return pty.onExit(listener)
    },
    write(data) {
      pty.write(data)
    },
    resize(cols, rows) {
      pty.resize(cols, rows)
    },
    kill(signal) {
      pty.kill(signal)
    },
  }
}

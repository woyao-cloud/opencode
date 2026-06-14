/**
 * pty/pty.node - Node.js PTY 实现：使用 node-pty 库创建伪终端
 *
 * 功能概述：
 * - Node.js 运行时的 PTY 实现
 * - 封装 @lydell/node-pty 库的 spawn、onData、onExit 接口
 *
 * 核心导出：
 * - spawn：创建 PTY 进程
 *
 * 架构位置：PTY 模块平台适配层，Node.js 运行时专用。
 * 上游依赖：pty/pty（PTY 类型定义）
 */
/** @ts-expect-error */
import * as pty from "@lydell/node-pty"
import type { Opts, Proc } from "./pty"

export type { Disp, Exit, Opts, Proc } from "./pty"

export function spawn(file: string, args: string[], opts: Opts): Proc {
  const proc = pty.spawn(file, args, opts)
  return {
    pid: proc.pid,
    onData(listener) {
      return proc.onData(listener)
    },
    onExit(listener) {
      return proc.onExit(listener)
    },
    write(data) {
      proc.write(data)
    },
    resize(cols, rows) {
      proc.resize(cols, rows)
    },
    kill(signal) {
      proc.kill(signal)
    },
  }
}

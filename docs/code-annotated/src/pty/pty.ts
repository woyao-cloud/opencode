/**
 * pty/pty - PTY 类型定义：伪终端核心类型接口
 *
 * 功能概述：
 * - 定义 PTY 的 Disp、Exit、Opts、Proc 等核心类型
 * - 提供跨平台的 PTY 接口抽象
 *
 * 核心导出：
 * - Proc：PTY 进程接口
 * - Opts：PTY 配置选项
 * - Disp：释放句柄
 * - Exit：退出信息
 *
 * 架构位置：PTY 模块类型层，定义 PTY 模块的核心接口契约。
 */
export type Disp = {
  dispose(): void
}

export type Exit = {
  exitCode: number
  signal?: number | string
}

export type Opts = {
  name: string
  cols?: number
  rows?: number
  cwd?: string
  env?: Record<string, string>
}

export type Proc = {
  pid: number
  onData(listener: (data: string) => void): Disp
  onExit(listener: (event: Exit) => void): Disp
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

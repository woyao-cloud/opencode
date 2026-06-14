/**
 * cli/cmd/run/runtime.stdin.ts - 交互模式终端输入检查
 *
 * 功能概述：
 * - 检查运行环境是否具有控制终端（TTY）用于交互输入
 * - 在没有控制终端时抛出错误提示
 *
 * 核心导出：
 * - INTERACTIVE_INPUT_ERROR: 缺少控制终端时的错误信息常量
 * - requireInteractiveInput: 检查终端可用性，无终端则退出
 *
 * 架构位置：CLI run 命令子模块的输入检查层，
 * 在交互模式启动时被调用
 */
import fs from "fs"
import * as tty from "node:tty"

export const INTERACTIVE_INPUT_ERROR = "--interactive requires a controlling terminal for input"

type InteractiveStdin = {
  stdin: NodeJS.ReadStream
  cleanup?: () => void
}

function openTerminalStdin(path: string): NodeJS.ReadStream {
  return new tty.ReadStream(fs.openSync(path, "r"))
}

export function resolveInteractiveStdin(
  stdin: NodeJS.ReadStream = process.stdin,
  open: (path: string) => NodeJS.ReadStream = openTerminalStdin,
  platform = process.platform,
): InteractiveStdin {
  if (stdin.isTTY) {
    return { stdin }
  }

  const file = platform === "win32" ? "CONIN$" : "/dev/tty"

  try {
    const stream = open(file)
    return {
      stdin: stream,
      cleanup: () => {
        stream.destroy()
      },
    }
  } catch (error) {
    throw new Error(INTERACTIVE_INPUT_ERROR, { cause: error })
  }
}

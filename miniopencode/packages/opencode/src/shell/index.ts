/**
 * shell/index.ts — Shell 服务
 *
 * 检测系统 shell、管理 shell 环境配置
 */

import { Effect, Layer, Context } from "effect"
import * as Log from "@miniopencode/core/util/log"
import os from "os"
import fs from "fs"
import path from "path"

const log = Log.create({ service: "shell" })

// ===== 服务接口 =====

export interface ShellService {
  readonly preferred: () => string
  readonly isLogin: (command: string) => boolean
  readonly detect: () => { shell: string; version: string }
  readonly getEnv: (cwd?: string) => Effect.Effect<Record<string, string>>
}

// ===== Context Tag =====

export class ShellServiceTag extends Context.Service<ShellServiceTag, ShellService>()("@miniopencode/Shell") {}

// ===== 实现 =====

const detectShell = (): string => {
  if (process.platform === "win32") {
    return process.env.COMSPEC || "cmd.exe"
  }
  return process.env.SHELL || "/bin/bash"
}

const shellVersion = (shell: string): string => {
  try {
    const result = require("child_process").execSync(`${shell} --version 2>&1`).toString().trim()
    return result.split("\n")[0] || "unknown"
  } catch {
    return "unknown"
  }
}

// ===== Layer =====

export const ShellLive = Layer.succeed(ShellServiceTag, {
  preferred: () => detectShell(),

  isLogin: (command: string) => {
    const base = path.basename(command).toLowerCase()
    return base === "bash" || base === "zsh" || base === "fish"
  },

  detect: () => {
    const shell = detectShell()
    return { shell, version: shellVersion(shell) }
  },

  getEnv: (cwd?: string) =>
    Effect.sync(() => {
      const env: Record<string, string> = {
        TERM: "xterm-256color",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        ...process.env as Record<string, string>,
      }
      if (cwd) env.PWD = cwd
      return env
    }),
})

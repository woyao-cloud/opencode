/**
 * tool/shell.ts — Shell 执行工具
 *
 * 执行 shell 命令并返回结果
 * 参考: packages/opencode/src/tool/shell/shell.ts
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { Def } from "./tool"
import { ShellServiceTag } from "@/shell/index"

const log = Log.create({ service: "tool.shell" })

export const ShellTool: Def<any> = {
  name: "shell",
  description: "在子进程中执行 shell 命令。返回 stdout、stderr 和退出码。支持超时控制",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的 shell 命令" },
      timeout: { type: "number", description: "超时时间（毫秒），默认 30000", default: 30000 },
      cwd: { type: "string", description: "工作目录" },
    },
    required: ["command"],
  },
  execute: (args: { command: string; timeout?: number; cwd?: string }) =>
    Effect.gen(function* () {
      const shell = yield* ShellServiceTag
      const timeout = args.timeout ?? 30000

      const result = yield* Effect.tryPromise({
        try: async () => {
          const proc = Bun.spawn(["sh", "-c", args.command], {
            cwd: args.cwd ?? process.cwd(),
            stdout: "pipe",
            stderr: "pipe",
            env: process.env as Record<string, string>,
          })

          const timer = setTimeout(() => proc.kill("SIGTERM"), timeout)

          const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
          ])
          clearTimeout(timer)
          const exitCode = await proc.exited

          return { stdout, stderr, exitCode }
        },
        catch: (err) => ({ stdout: "", stderr: String(err), exitCode: -1 }),
      })

      log.info("shell executed", {
        command: args.command,
        exitCode: result.exitCode,
        outLen: result.stdout.length,
      })

      return [
        result.stdout ? `stdout:\n${result.stdout}` : "",
        result.stderr ? `stderr:\n${result.stderr}` : "",
        `exit code: ${result.exitCode}`,
      ].filter(Boolean).join("\n") || "(无输出)"
    }),
}

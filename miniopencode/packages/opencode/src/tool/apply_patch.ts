/**
 * tool/apply_patch.ts — Patch 应用工具
 *
 * 应用 unified diff 格式的 patch 到文件
 */

import { Effect } from "effect"
import * as Log from "@miniopencode/core/util/log"
import type { Def } from "./tool"
import fs from "fs"
import path from "path"

const log = Log.create({ service: "tool.apply_patch" })

export const ApplyPatchTool: Def<any> = {
  name: "apply_patch",
  description: "应用 unified diff 格式的 patch 到文件。patch 格式参考 git diff 输出",
  parameters: {
    type: "object",
    properties: {
      patch: { type: "string", description: "unified diff 格式的 patch 内容" },
    },
    required: ["patch"],
  },
  execute: (args: { patch: string }) =>
    Effect.gen(function* () {
      const { patch } = args

      // 解析 patch 中的文件路径
      const fileMatch = patch.match(/^--- [ab]\/(.+)$/m)
      if (!fileMatch) {
        return "错误: 无法从 patch 中解析文件路径。patch 应以 '--- a/<file>' 开头"
      }

      const filePath = fileMatch[1].trim()
      const fullPath = path.resolve(filePath)

      if (!fs.existsSync(fullPath)) {
        return `错误: 文件不存在: ${fullPath}`
      }

      // 使用 git apply 应用 patch
      const result = yield* Effect.tryPromise({
        try: async () => {
          const proc = Bun.spawn(["git", "apply"], {
            cwd: path.dirname(fullPath),
            stdin: "pipe",
            stdio: ["pipe", "pipe", "pipe"],
          })
          proc.stdin?.write(patch)
          proc.stdin?.end()
          const exitCode = await proc.exited
          if (exitCode !== 0) {
            const stderr = new TextDecoder().decode(await new Response(proc.stderr).arrayBuffer())
            throw new Error(stderr.trim())
          }
          return `已成功应用 patch 到 ${filePath}`
        },
        catch: (err) => `错误: patch 应用失败: ${err}`,
      })

      log.info("patch applied", { file: filePath })
      return result
    }),
}

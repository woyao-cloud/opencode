/**
 * format/index.ts — 代码格式化服务
 *
 * 支持多种语言的代码格式化
 */

import { Effect, Layer, Context } from "effect"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "format" })

// ===== 服务接口 =====

export interface FormatService {
  readonly format: (code: string, language: string) => Effect.Effect<string>
  readonly isAvailable: (language: string) => Effect.Effect<boolean>
}

// ===== Context Tag =====

export class FormatServiceTag extends Context.Service<FormatServiceTag, FormatService>()("@miniopencode/Format") {}

// ===== 格式化器映射 =====

const formatters: Record<string, { command: string; args: string[] }> = {
  typescript: { command: "prettier", args: ["--parser", "typescript"] },
  javascript: { command: "prettier", args: ["--parser", "babel"] },
  json: { command: "prettier", args: ["--parser", "json"] },
  css: { command: "prettier", args: ["--parser", "css"] },
  html: { command: "prettier", args: ["--parser", "html"] },
  markdown: { command: "prettier", args: ["--parser", "markdown"] },
  yaml: { command: "prettier", args: ["--parser", "yaml"] },
  rust: { command: "rustfmt", args: ["--emit", "stdout"] },
  go: { command: "gofmt", args: [] },
}

// ===== Layer =====

export const FormatLive = Layer.succeed(FormatServiceTag, {
  format: (code: string, language: string) =>
    Effect.tryPromise({
      try: async () => {
        const fmt = formatters[language]
        if (!fmt) {
          log.warn("no formatter available", { language })
          return code
        }

        const proc = Bun.spawn([fmt.command, ...fmt.args], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        })

        proc.stdin?.write(code)
        proc.stdin?.end()

        const exitCode = await proc.exited
        if (exitCode !== 0) {
          const stderr = new TextDecoder().decode(await new Response(proc.stderr).arrayBuffer())
          log.warn("formatter failed", { language, stderr })
          return code
        }

        return new TextDecoder().decode(await new Response(proc.stdout).arrayBuffer())
      },
      catch: (err) => {
        log.warn("format error", { language, error: String(err) })
        return code
      },
    }),

  isAvailable: (language: string) =>
    Effect.sync(() => language in formatters),
})

/**
 * cli/cmd/generate - "opencode generate" 命令
 *
 * 功能概述：
 * - 实现 generate 命令，生成 OpenAPI 规范代码示例
 * - 遍历服务器 OpenAPI 规范并为每个操作添加代码示例
 *
 * 核心导出：
 * - GenerateCommand: yargs CommandModule 对象
 *
 * 架构位置：CLI 命令层（开发工具），被 cli/cmd/ 索引注册，依赖 server 模块
 */

import { Server } from "../../server/server"
import type { CommandModule } from "yargs"

type Args = {}

export const GenerateCommand = {
  command: "generate",
  builder: (yargs) => yargs,
  handler: async () => {
    const specs = (await Server.openapi()) as { paths: Record<string, Record<string, any>> }
    for (const item of Object.values(specs.paths)) {
      for (const method of ["get", "post", "put", "delete", "patch"] as const) {
        const operation = item[method]
        if (!operation?.operationId) continue
        operation["x-codeSamples"] = [
          {
            lang: "js",
            source: [
              `import { createOpencodeClient } from "@opencode-ai/sdk`,
              ``,
              `const client = createOpencodeClient()`,
              `await client.${operation.operationId}({`,
              `  ...`,
              `})`,
            ].join("\n"),
          },
        ]
      }
    }
    const raw = JSON.stringify(specs, null, 2)

    // Format through prettier so output is byte-identical to committed file
    // regardless of whether ./script/format.ts runs afterward.
    const prettier = await import("prettier")
    const babel = await import("prettier/plugins/babel")
    const estree = await import("prettier/plugins/estree")
    const format = prettier.format ?? prettier.default?.format
    const json = await format(raw, {
      parser: "json",
      plugins: [babel.default ?? babel, estree.default ?? estree],
      printWidth: 120,
    })

    // Wait for stdout to finish writing before process.exit() is called
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(json, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  },
} satisfies CommandModule<object, Args>

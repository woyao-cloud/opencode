/**
 * cli/cmd/acp - "opencode acp" 命令
 *
 * 功能概述：
 * - 实现 acp (Agent Client Protocol) 子命令，启动 ACP 服务端
 * - 支持通过 --port 等网络选项配置服务监听
 *
 * 核心导出：
 * - AcpCommand: 使用 effectCmd 封装的 yargs 命令定义
 *
 * 架构位置：CLI 命令层，被 cli/cmd/ 索引注册，依赖 ACP 模块和 server 模块
 */

import * as Log from "@opencode-ai/core/util/log"
import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import { ACP } from "@/acp/agent"
import { Server } from "@/server/server"
import { ServerAuth } from "@/server/auth"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { withNetworkOptions, resolveNetworkOptions } from "../network"

const log = Log.create({ service: "acp-command" })

export const AcpCommand = effectCmd({
  command: "acp",
  describe: "start ACP (Agent Client Protocol) server",
  builder: (yargs) => {
    return withNetworkOptions(yargs).option("cwd", {
      describe: "working directory",
      type: "string",
      default: process.cwd(),
    })
  },
  handler: Effect.fn("Cli.acp")(function* (args) {
    process.env.OPENCODE_CLIENT = "acp"
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))

    const sdk = createOpencodeClient({
      baseUrl: `http://${server.hostname}:${server.port}`,
      headers: ServerAuth.headers(),
    })

    const input = new WritableStream<Uint8Array>({
      write(chunk) {
        return new Promise<void>((resolve, reject) => {
          process.stdout.write(chunk, (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
      },
    })
    const output = new ReadableStream<Uint8Array>({
      start(controller) {
        process.stdin.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        process.stdin.on("end", () => controller.close())
        process.stdin.on("error", (err) => controller.error(err))
      },
    })

    const stream = ndJsonStream(input, output)
    const agent = ACP.init({ sdk })

    new AgentSideConnection((conn) => {
      return agent.create(conn, { sdk })
    }, stream)

    log.info("setup connection")
    process.stdin.resume()
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          process.stdin.on("end", () => resolve())
          process.stdin.on("error", reject)
        }),
    )
  }),
})

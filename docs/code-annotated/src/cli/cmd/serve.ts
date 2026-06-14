/**
 * cli/cmd/serve - "opencode serve" 命令
 *
 * 功能概述：
 * - 实现 serve 命令，启动无头 opencode 服务端
 * - 支持网络选项配置，按请求头 x-opencode-directory 按需加载实例
 *
 * 核心导出：
 * - ServeCommand: 使用 effectCmd 封装的 yargs 命令定义（instance: false）
 *
 * 架构位置：CLI 命令层，被 cli/cmd/ 索引注册，依赖 server 模块和 network 配置
 */

import { Effect } from "effect"
import { Server } from "../../server/server"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless opencode server",
  // Server loads instances per-request via x-opencode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)

    yield* Effect.never
  }),
})

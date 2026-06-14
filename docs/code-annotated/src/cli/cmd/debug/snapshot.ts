/**
 * cli/cmd/debug/snapshot - "opencode debug snapshot" 命令
 *
 * 功能概述：
 * - 提供快照调试工具，包含 track/patch/diff 子命令
 *
 * 核心导出：
 * - SnapshotCommand: yargs CommandModule，包含 TrackCommand / PatchCommand / DiffCommand 子命令
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册，依赖 snapshot 模块
 */

import { Effect } from "effect"
import { Snapshot } from "../../../snapshot"
import { effectCmd } from "../../effect-cmd"
import { cmd } from "../cmd"

export const SnapshotCommand = cmd({
  command: "snapshot",
  describe: "snapshot debugging utilities",
  builder: (yargs) => yargs.command(TrackCommand).command(PatchCommand).command(DiffCommand).demandCommand(),
  async handler() {},
})

const TrackCommand = effectCmd({
  command: "track",
  describe: "track current snapshot state",
  handler: Effect.fn("Cli.debug.snapshot.track")(function* () {
    const out = yield* Snapshot.Service.use((svc) => svc.track())
    console.log(out)
  }),
})

const PatchCommand = effectCmd({
  command: "patch <hash>",
  describe: "show patch for a snapshot hash",
  builder: (yargs) =>
    yargs.positional("hash", {
      type: "string",
      description: "hash",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.debug.snapshot.patch")(function* (args) {
    const out = yield* Snapshot.Service.use((svc) => svc.patch(args.hash))
    console.log(out)
  }),
})

const DiffCommand = effectCmd({
  command: "diff <hash>",
  describe: "show diff for a snapshot hash",
  builder: (yargs) =>
    yargs.positional("hash", {
      type: "string",
      description: "hash",
      demandOption: true,
    }),
  handler: Effect.fn("Cli.debug.snapshot.diff")(function* (args) {
    const out = yield* Snapshot.Service.use((svc) => svc.diff(args.hash))
    console.log(out)
  }),
})

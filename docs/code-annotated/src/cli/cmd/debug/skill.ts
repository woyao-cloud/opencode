/**
 * cli/cmd/debug/skill - "opencode debug skill" 命令
 *
 * 功能概述：
 * - 列出所有已注册的 skill，用于调试 skill 系统
 *
 * 核心导出：
 * - SkillCommand: 使用 effectCmd 封装的 yargs 命令定义
 *
 * 架构位置：CLI debug 命令组，被 debug/index.ts 注册，依赖 skill 模块
 */

import { EOL } from "os"
import { Effect } from "effect"
import { Skill } from "../../../skill"
import { effectCmd } from "../../effect-cmd"

export const SkillCommand = effectCmd({
  command: "skill",
  describe: "list all available skills",
  builder: (yargs) => yargs,
  handler: Effect.fn("Cli.debug.skill")(function* () {
    const skill = yield* Skill.Service
    const skills = yield* skill.all()
    process.stdout.write(JSON.stringify(skills, null, 2) + EOL)
  }),
})

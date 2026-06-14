/**
 * AgentCommand - "opencode agent" 命令
 *
 * 功能概述：
 * - AgentCreateCommand: 创建 agent，支持交互式和 CLI 参数两种方式
 * - AgentListCommand: 列出所有可用 agent
 * - 创建时引导用户选择路径、描述、权限、模式等
 * - 权限以 permission 层面配置（非原始 tool 名），多个 tool 可映射到同一权限
 *
 * 核心导出：
 * - AgentCommand: 使用 cmd 封装的 yargs 命令定义，包含 create 和 list 子命令
 * - AgentCreateCommand: 创建 agent 子命令
 * - AgentListCommand: 列表子命令
 *
 * 架构位置：CLI 命令层，被 cli/cmd/ 索引注册，依赖 agent 模块和 provider 模块
 */

import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Global } from "@opencode-ai/core/global"
import { Agent } from "../../agent/agent"
import { Provider } from "@/provider/provider"
import path from "path"
import fs from "fs/promises"
import { Filesystem } from "@/util/filesystem"
import matter from "gray-matter"
import { InstanceRef } from "@/effect/instance-ref"
import { EOL } from "os"
import type { Argv } from "yargs"
import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"

type AgentMode = "all" | "primary" | "subagent"

// Permission keys (not raw tool names). Multiple tools can map to a single
// permission — e.g. write/edit/apply_patch all gate on `edit` — so we configure
// agents at the permission level to match how the runtime actually enforces it.
// 权限键（非原始 tool 名）。多个 tool 可映射到同一权限：如 write/edit/apply_patch 都映射到 edit 权限。
const AVAILABLE_PERMISSIONS = [
  "bash",
  "read",
  "edit",
  "glob",
  "grep",
  "webfetch",
  "task",
  "todowrite",
  "websearch",
  "lsp",
  "skill",
]

const AgentCreateCommand = effectCmd({
  command: "create",
  describe: "create a new agent",
  builder: (yargs: Argv) =>
    yargs
      .option("path", {
        type: "string",
        describe: "directory path to generate the agent file",
      })
      .option("description", {
        type: "string",
        describe: "what the agent should do",
      })
      .option("mode", {
        type: "string",
        describe: "agent mode",
        choices: ["all", "primary", "subagent"] as const,
      })
      .option("permissions", {
        type: "string",
        alias: ["tools"],
        describe: `comma-separated list of permissions to allow (default: all). Available: "${AVAILABLE_PERMISSIONS.join(", ")}"`,
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      }),
  handler: Effect.fn("Cli.agent.create")(function* (args) {
    const maybeCtx = yield* InstanceRef
    if (!maybeCtx) return yield* Effect.die("InstanceRef not provided")
    const ctx = maybeCtx
    const agentSvc = yield* Agent.Service
    yield* Effect.promise(async () => {
      const cliPath = args.path
      const cliDescription = args.description
      const cliMode = args.mode as AgentMode | undefined
      const perms = args.permissions

      const isFullyNonInteractive = cliPath && cliDescription && cliMode && perms !== undefined

      if (!isFullyNonInteractive) {
        UI.empty()
        prompts.intro("Create agent")
      }

      const project = ctx.project

      // Determine scope/path
      // 确定 agent 文件存放路径：CLI 参数指定路径 / 项目内 .opencode/agents / 全局配置目录
      let targetPath: string
      if (cliPath) {
        targetPath = path.join(cliPath, "agents")
      } else {
        let scope: "global" | "project" = "global"
        if (project.vcs === "git") {
          const scopeResult = await prompts.select({
            message: "Location",
            options: [
              {
                label: "Current project",
                value: "project" as const,
                hint: ctx.worktree,
              },
              {
                label: "Global",
                value: "global" as const,
                hint: Global.Path.config,
              },
            ],
          })
          if (prompts.isCancel(scopeResult)) throw new UI.CancelledError()
          scope = scopeResult
        }
        targetPath = path.join(scope === "global" ? Global.Path.config : path.join(ctx.worktree, ".opencode"), "agents")
      }

      // Get description
      let description: string
      if (cliDescription) {
        description = cliDescription
      } else {
        const query = await prompts.text({
          message: "Description",
          placeholder: "What should this agent do?",
          validate: (x) => (x && x.length > 0 ? undefined : "Required"),
        })
        if (prompts.isCancel(query)) throw new UI.CancelledError()
        description = query
      }

      // Generate agent
      const spinner = prompts.spinner()
      spinner.start("Generating agent configuration...")
      const model = args.model ? Provider.parseModel(args.model) : undefined
      const generated = await Effect.runPromise(agentSvc.generate({ description, model })).catch((error) => {
        spinner.stop(`LLM failed to generate agent: ${error.message}`, 1)
        if (isFullyNonInteractive) process.exit(1)
        throw new UI.CancelledError()
      })
      spinner.stop(`Agent ${generated.identifier} generated`)

      // Select permissions to allow
      let selected: string[]
      if (perms !== undefined) {
        selected = perms ? perms.split(",").map((t) => t.trim()) : AVAILABLE_PERMISSIONS
      } else {
        const result = await prompts.multiselect({
          message: "Select permissions to allow (Space to toggle)",
          options: AVAILABLE_PERMISSIONS.map((permission) => ({
            label: permission,
            value: permission,
          })),
          initialValues: AVAILABLE_PERMISSIONS,
        })
        if (prompts.isCancel(result)) throw new UI.CancelledError()
        selected = result
      }

      // Get mode
      let mode: AgentMode
      if (cliMode) {
        mode = cliMode
      } else {
        const modeResult = await prompts.select({
          message: "Agent mode",
          options: [
            {
              label: "All",
              value: "all" as const,
              hint: "Can function in both primary and subagent roles",
            },
            {
              label: "Primary",
              value: "primary" as const,
              hint: "Acts as a primary/main agent",
            },
            {
              label: "Subagent",
              value: "subagent" as const,
              hint: "Can be used as a subagent by other agents",
            },
          ],
          initialValue: "all" as const,
        })
        if (prompts.isCancel(modeResult)) throw new UI.CancelledError()
        mode = modeResult
      }

      // Build permissions config — deny anything not explicitly selected.
      // 构建权限配置：未明确选择的权限全部设为 deny
      const permissions: Record<string, "deny"> = {}
      for (const permission of AVAILABLE_PERMISSIONS) {
        if (!selected.includes(permission)) {
          permissions[permission] = "deny"
        }
      }

      // Build frontmatter
      const frontmatter: {
        description: string
        mode: AgentMode
        permission?: Record<string, "deny">
      } = {
        description: generated.whenToUse,
        mode,
      }
      if (Object.keys(permissions).length > 0) {
        frontmatter.permission = permissions
      }

      // Write file
      const content = matter.stringify(generated.systemPrompt, frontmatter)
      const filePath = path.join(targetPath, `${generated.identifier}.md`)

      await fs.mkdir(targetPath, { recursive: true })

      if (await Filesystem.exists(filePath)) {
        if (isFullyNonInteractive) {
          console.error(`Error: Agent file already exists: ${filePath}`)
          process.exit(1)
        }
        prompts.log.error(`Agent file already exists: ${filePath}`)
        throw new UI.CancelledError()
      }

      await Filesystem.write(filePath, content)

      if (isFullyNonInteractive) {
        console.log(filePath)
      } else {
        prompts.log.success(`Agent created: ${filePath}`)
        prompts.outro("Done")
      }
    })
  }),
})

const AgentListCommand = effectCmd({
  command: "list",
  describe: "list all available agents",
  handler: Effect.fn("Cli.agent.list")(function* () {
    const agents = yield* Agent.Service.use((svc) => svc.list())
    const sortedAgents = agents.sort((a, b) => {
      if (a.native !== b.native) {
        return a.native ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    for (const agent of sortedAgents) {
      process.stdout.write(`${agent.name} (${agent.mode})` + EOL)
      process.stdout.write(`  ${JSON.stringify(agent.permission, null, 2)}` + EOL)
    }
  }),
})

export const AgentCommand = cmd({
  command: "agent",
  describe: "manage agents",
  builder: (yargs) => yargs.command(AgentCreateCommand).command(AgentListCommand).demandCommand(),
  async handler() {},
})

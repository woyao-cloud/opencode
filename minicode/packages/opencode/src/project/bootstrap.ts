import { Layer } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { Config } from "@/config/config"
import { Bus } from "@/bus"
import { Permission } from "@/permission"
import { Plugin } from "@/plugin"
import { Skill } from "@/skill"
import { Agent } from "@/agent/agent"
import { Session } from "@/session/session"
import { ToolRegistry } from "@/tool/registry"
import * as ProjectMod from "@/project/project"
import { Command } from "@/command"
import { ACPAgent } from "@/agent-bus"
import { BackgroundJob } from "@/background/job"

// Agent depends on Config. Layer.provideMerge feeds Config into Agent
// while keeping Config in the final context for other services.
const agentWithConfig = (Agent.defaultLayer as any).pipe(Layer.provideMerge(Config.defaultLayer as any))

// ToolRegistry (via TaskTool) depends on Agent + Session + Project.
// Merge all deps into one layer, then provideMerge that into ToolRegistry.
const toolDeps = Layer.mergeAll(agentWithConfig as any, Session.defaultLayer as any, ProjectMod.defaultLayer as any)
const toolsWithDeps = (ToolRegistry.defaultLayer as any).pipe(Layer.provideMerge(toolDeps as any))

// ACP depends on Bus
const acpWithBus = (ACPAgent.defaultLayer as any).pipe(Layer.provideMerge(Bus.defaultLayer as any))

export const InstanceLayer = Layer.mergeAll(
  Config.defaultLayer,
  Bus.defaultLayer,
  Permission.defaultLayer,
  Plugin.defaultLayer,
  Skill.defaultLayer,
  agentWithConfig as any,
  Session.defaultLayer,
  toolsWithDeps as any,
  ProjectMod.defaultLayer,
  Command.defaultLayer,
  acpWithBus as any,
  BackgroundJob.defaultLayer,
)
export const DefaultInstanceRef = Layer.succeed(InstanceRef, { directory: process.cwd(), worktree: "/" })
export * as Bootstrap from "./bootstrap"

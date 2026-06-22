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

// Agent depends on Config (Agent's layer build effect yields Config.Service).
// Layer.mergeAll treats all layers as siblings, so Agent can't find Config.
// Fix: provide Config to Agent via Layer.provideMerge, then merge the result
// with the other sibling layers.
const agentWithConfig = (Agent.defaultLayer as any).pipe(Layer.provideMerge(Config.defaultLayer as any))

export const InstanceLayer = Layer.mergeAll(
  Config.defaultLayer,
  Bus.defaultLayer,
  Permission.defaultLayer,
  Plugin.defaultLayer,
  Skill.defaultLayer,
  agentWithConfig as any,
  Session.defaultLayer,
  ToolRegistry.defaultLayer,
  ProjectMod.defaultLayer,
  Command.defaultLayer,
)
export const DefaultInstanceRef = Layer.succeed(InstanceRef, { directory: process.cwd(), worktree: "/" })
export * as Bootstrap from "./bootstrap"

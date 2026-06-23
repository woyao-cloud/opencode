import { Layer } from "effect"
import { ConfigLive } from "@/config/config"
import { AgentLive } from "@/agent/agent"
import { PermissionLive } from "@/permission/index"
import { ProjectLive } from "./project"
import { ToolRuntimeLive } from "@/tool/registry"

export const InstanceLayer = Layer.mergeAll(
  ConfigLive,
  AgentLive,
  PermissionLive,
  ProjectLive,
  ToolRuntimeLive,
)

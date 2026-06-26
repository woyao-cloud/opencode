// ── HttpApi Route Definitions ────────────────────────────────────

import { HttpApi } from "effect/unstable/httpapi"
import { Authorization } from "./middleware/authorization"
import { SchemaErrorMiddleware } from "./middleware/schema-error"
import { SessionGroup } from "./groups/session"
import { ConfigGroup } from "./groups/config"
import { ProviderGroup } from "./groups/provider"
import { FileGroup } from "./groups/file"
import { ProjectGroup } from "./groups/project"
import { PermissionGroup } from "./groups/permission"
import { QuestionGroup } from "./groups/question"
import { InstanceGroup } from "./groups/instance"
import { GlobalGroup } from "./groups/global"
import { EventGroup } from "./groups/event"
import { MCPGroup } from "./groups/mcp"
import { PTYGroup } from "./groups/pty"
import { ControlGroup } from "./groups/control"
import { WorkspaceGroup } from "./groups/workspace"
import { SyncGroup } from "./groups/sync"
import { TUIGroup } from "./groups/tui"
import { V2Group } from "./groups/v2"

// ── Root API (no instance context) ──────────────────────────────

export const RootHttpApi = HttpApi.make("miniopencode-root")
  .middleware(SchemaErrorMiddleware)
  .middleware(Authorization)

// ── Instance API (requires instance context) ─────────────────────

export const InstanceHttpApi = (HttpApi.make("miniopencode-instance") as any)
  .add(SessionGroup)
  .add(ConfigGroup)
  .add(ProviderGroup)
  .add(FileGroup)
  .add(ProjectGroup)
  .add(PermissionGroup)
  .add(QuestionGroup)
  .add(InstanceGroup)
  .add(GlobalGroup)
  .add(EventGroup)
  .add(MCPGroup)
  .add(PTYGroup)
  .add(ControlGroup)
  .add(WorkspaceGroup)
  .add(SyncGroup)
  .add(TUIGroup)
  .add(V2Group)
  .middleware(SchemaErrorMiddleware) as any

// ── Combined API ───────────────────────────────────────────────

export const MiniOpenCodeHttpApi = HttpApi.make("miniopencode")
  .addHttpApi(RootHttpApi)
  .addHttpApi(InstanceHttpApi)

export type RootHttpApiType = typeof RootHttpApi
export type InstanceHttpApiType = typeof InstanceHttpApi

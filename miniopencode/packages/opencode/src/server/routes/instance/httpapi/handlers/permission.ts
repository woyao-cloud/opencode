// ── Permission Handlers ──────────────────────────────────────────

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { PermissionService } from "@/permission/index"
import { checkToolPermission } from "@/permission/evaluate"
import { InstanceHttpApi } from "../api"

export const permissionHandlers = (HttpApiBuilder.group as any)(InstanceHttpApi, "permission", (handlers: any) =>
  Effect.gen(function* () {
    const permission = yield* PermissionService

    handlers.handle("permissionGet", () =>
      Effect.succeed(permission)
    )

    handlers.handle("permissionEvaluate", (request: any) =>
      Effect.sync(() => {
        const tool = request.query.tool
        return checkToolPermission(tool, [])
      })
    )

    return handlers
  })
)

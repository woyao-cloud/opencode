/**
 * handlers/permission - 权限 API 处理器
 *
 * 功能概述：
 * - 实现权限管理相关的 HTTP API 端点业务逻辑
 *
 * 核心导出：
 * - 权限 API 处理器函数
 *
 * 架构位置：HTTP API 处理器层，依赖 Permission 和 PermissionID
 */

import { Permission } from "@/permission"
import { PermissionID } from "@/permission/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const permissionHandlers = HttpApiBuilder.group(InstanceHttpApi, "permission", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Permission.Service

    const list = Effect.fn("PermissionHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const reply = Effect.fn("PermissionHttpApi.reply")(function* (ctx: {
      params: { requestID: PermissionID }
      payload: Permission.ReplyBody
    }) {
      yield* svc.reply({
        requestID: ctx.params.requestID,
        reply: ctx.payload.reply,
        message: ctx.payload.message,
      })
      return true
    })

    return handlers.handle("list", list).handle("reply", reply)
  }),
)

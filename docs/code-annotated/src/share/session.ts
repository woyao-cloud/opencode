/**
 * share/session - 会话分享服务：管理会话的分享和远程访问
 *
 * 功能概述：
 * - 创建可分享的会话链接
 * - 管理会话的分享和取消分享
 * - 集成同步事件
 *
 * 核心导出：
 * - Service：会话分享服务 Context 类
 * - layer：会话分享 Effect Layer
 *
 * 架构位置：Share 模块服务层，提供会话协作分享能力。
 * 上游依赖：share/share-next（下一代分享实现）、config/config（配置）
 */
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { SyncEvent } from "@/sync"
import { Effect, Layer, Scope, Context } from "effect"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import * as ShareNext from "./share-next"

export interface Interface {
  readonly create: (input?: Session.CreateInput) => Effect.Effect<Session.Info>
  readonly share: (sessionID: SessionID) => Effect.Effect<{ url: string }, unknown>
  readonly unshare: (sessionID: SessionID) => Effect.Effect<void, unknown>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionShare") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const session = yield* Session.Service
    const shareNext = yield* ShareNext.Service
    const scope = yield* Scope.Scope
    const sync = yield* SyncEvent.Service
    const flags = yield* RuntimeFlags.Service

    const share = Effect.fn("SessionShare.share")(function* (sessionID: SessionID) {
      const conf = yield* cfg.get()
      if (conf.share === "disabled") throw new Error("Sharing is disabled in configuration")
      const result = yield* shareNext.create(sessionID)
      yield* sync.run(Session.Event.Updated, { sessionID, info: { share: { url: result.url } } })
      return result
    })

    const unshare = Effect.fn("SessionShare.unshare")(function* (sessionID: SessionID) {
      yield* shareNext.remove(sessionID)
      yield* sync.run(Session.Event.Updated, { sessionID, info: { share: { url: null } } })
    })

    const create = Effect.fn("SessionShare.create")(function* (input?: Session.CreateInput) {
      const result = yield* session.create(input)
      if (result.parentID) return result
      const conf = yield* cfg.get()
      if (!(flags.autoShare || conf.share === "auto")) return result
      yield* share(result.id).pipe(Effect.ignore, Effect.forkIn(scope))
      return result
    })

    return Service.of({ create, share, unshare })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(ShareNext.defaultLayer),
  Layer.provide(Session.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(SyncEvent.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)

export * as SessionShare from "./session"

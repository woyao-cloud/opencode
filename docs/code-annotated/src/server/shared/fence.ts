/**
 * server/shared/fence - 操作围栏（Fence）校验
 *
 * 功能概述：
 * - 基于事件序列表校验操作是否允许执行
 *
 * 核心导出：
 * - （校验函数及相关类型）
 *
 * 架构位置：被授权中间件引用，依赖 Database 和 EventSequenceTable
 */

import { Database } from "@/storage/db"
import { inArray } from "drizzle-orm"
import { EventSequenceTable } from "@/sync/event.sql"
import { Workspace } from "@/control-plane/workspace"
import type { WorkspaceID } from "@/control-plane/schema"
import * as Log from "@opencode-ai/core/util/log"
import { AppRuntime } from "@/effect/app-runtime"
import { Effect } from "effect"

export const HEADER = "x-opencode-sync"
export type State = Record<string, number>
const log = Log.create({ service: "fence" })

export function load(ids?: string[]) {
  const rows = Database.use((db) => {
    if (!ids?.length) {
      return db.select().from(EventSequenceTable).all()
    }

    return db.select().from(EventSequenceTable).where(inArray(EventSequenceTable.aggregate_id, ids)).all()
  })

  return Object.fromEntries(rows.map((row) => [row.aggregate_id, row.seq])) as State
}

export function diff(prev: State, next: State) {
  const ids = new Set([...Object.keys(prev), ...Object.keys(next)])
  return Object.fromEntries(
    [...ids]
      .map((id) => [id, next[id] ?? -1] as const)
      .filter(([id, seq]) => {
        return (prev[id] ?? -1) !== seq
      }),
  ) as State
}

export function parse(headers: Headers) {
  const raw = headers.get(HEADER)
  if (!raw) return

  let data

  try {
    data = JSON.parse(raw)
  } catch {
    return
  }

  if (!data || typeof data !== "object") return

  return Object.fromEntries(
    Object.entries(data).filter(([id, seq]) => {
      return typeof id === "string" && Number.isInteger(seq)
    }),
  ) as State
}

export function waitEffect(workspaceID: WorkspaceID, state: State, signal?: AbortSignal) {
  return Effect.gen(function* () {
    log.info("waiting for state", {
      workspaceID,
      state,
    })
    yield* Workspace.Service.use((workspace) => workspace.waitForSync(workspaceID, state, signal))
    log.info("state fully synced", {
      workspaceID,
      state,
    })
  })
}

export async function wait(workspaceID: WorkspaceID, state: State, signal?: AbortSignal) {
  await AppRuntime.runPromise(waitEffect(workspaceID, state, signal))
}

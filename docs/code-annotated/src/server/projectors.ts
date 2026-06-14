/**
 * server/projectors - 服务端投影器聚合
 *
 * 功能概述：
 * - 聚合并初始化所有会话投影器
 *
 * 核心导出：
 * - initProjectors：初始化全部投影器
 *
 * 架构位置：被 init-projectors 调用，依赖 session/projectors 和 SyncEvent
 */

import sessionProjectors from "../session/projectors"
import { SyncEvent } from "@/sync"
import { Session } from "@/session/session"
import { SessionTable } from "@/session/session.sql"
import { Database } from "@/storage/db"
import { eq } from "drizzle-orm"

export function initProjectors() {
  SyncEvent.init({
    projectors: sessionProjectors,
    convertEvent: (type, data) => {
      if (type === "session.updated") {
        const id = (data as SyncEvent.Event<typeof Session.Event.Updated>["data"]).sessionID
        const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())

        if (!row) return data

        return {
          sessionID: id,
          info: Session.fromRow(row),
        }
      }
      return data
    },
  })
}

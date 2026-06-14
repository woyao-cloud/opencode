/**
 * [sync/event.sql] - 同步事件 SQL 表定义
 *
 * 功能概述：
 * - 定义事件同步的 SQLite 表结构（事件序列表和事件表）
 *
 * 核心导出：
 * - EventSequenceTable：事件序列表（aggregate_id、seq、owner_id）
 * - EventTable：事件表（id、aggregate_id、seq、type、data）
 *
 * 架构位置：上游依赖 drizzle-orm；下游被 sync/index.ts 引用
 */
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"

export const EventSequenceTable = sqliteTable("event_sequence", {
  aggregate_id: text().notNull().primaryKey(),
  seq: integer().notNull(),
  owner_id: text(),
})

export const EventTable = sqliteTable("event", {
  id: text().primaryKey(),
  aggregate_id: text()
    .notNull()
    .references(() => EventSequenceTable.aggregate_id, { onDelete: "cascade" }),
  seq: integer().notNull(),
  type: text().notNull(),
  data: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
})

/**
 * share/share.sql - 会话分享 SQL 表定义：存储分享会话的数据库表
 *
 * 功能概述：
 * - 定义分享会话的数据库表 Schema
 * - 包含会话 ID、分享 ID、密钥、URL 等字段
 *
 * 核心导出：
 * - SessionShareTable：会话分享表定义
 *
 * 架构位置：Share 模块数据持久化层，被 share/share-next.ts 服务层使用。
 * 上游依赖：storage/schema.sql（时间戳基表）
 */
import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/session.sql"
import { Timestamps } from "../storage/schema.sql"

export const SessionShareTable = sqliteTable("session_share", {
  session_id: text()
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  id: text().notNull(),
  secret: text().notNull(),
  url: text().notNull(),
  ...Timestamps,
})

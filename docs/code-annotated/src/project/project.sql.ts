/**
 * project/project.sql - 项目 SQL 表定义：数据库中的项目表 Schema
 *
 * 功能概述：
 * - 定义项目表的 drizzle ORM Schema
 * - 包含 ID、工作目录、VCS 信息、名称、图标等字段
 *
 * 核心导出：
 * - ProjectTable：项目数据库表定义
 *
 * 架构位置：Project 模块数据持久化层，被 project/project.ts 服务层使用。
 * 上游依赖：storage/schema.sql（时间戳基表）
 */
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"
import type { ProjectID } from "./schema"

export const ProjectTable = sqliteTable("project", {
  id: text().$type<ProjectID>().primaryKey(),
  worktree: text().notNull(),
  vcs: text(),
  name: text(),
  icon_url: text(),
  icon_url_override: text(),
  icon_color: text(),
  ...Timestamps,
  time_initialized: integer(),
  sandboxes: text({ mode: "json" }).notNull().$type<string[]>(),
  commands: text({ mode: "json" }).$type<{ start?: string }>(),
})

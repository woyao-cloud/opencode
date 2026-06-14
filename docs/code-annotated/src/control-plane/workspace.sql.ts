/**
 * [control-plane/workspace.sql] - 工作区数据表定义
 * 功能概述：定义 WorkspaceTable（工作区表），包含类型、名称、分支、目录、项目 ID 等字段
 * 核心导出：WorkspaceTable
 * 架构位置：storage layer，依赖 drizzle-orm 和 project 表
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { ProjectTable } from "../project/project.sql"
import type { ProjectID } from "../project/schema"
import type { WorkspaceID } from "./schema"

export const WorkspaceTable = sqliteTable("workspace", {
  id: text().$type<WorkspaceID>().primaryKey(),
  type: text().notNull(),
  name: text().notNull().default(""),
  branch: text(),
  directory: text(),
  extra: text({ mode: "json" }),
  project_id: text()
    .$type<ProjectID>()
    .notNull()
    .references(() => ProjectTable.id, { onDelete: "cascade" }),
  time_used: integer()
    .notNull()
    .$default(() => Date.now()),
})

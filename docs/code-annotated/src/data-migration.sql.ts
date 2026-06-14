/**
 * [data-migration.sql] - 数据迁移数据表定义
 * 功能概述：定义 DataMigrationTable（迁移记录表），记录已执行的迁移名称和完成时间
 * 核心导出：DataMigrationTable
 * 架构位置：storage layer，依赖 drizzle-orm
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const DataMigrationTable = sqliteTable("data_migration", {
  name: text().primaryKey(),
  time_completed: integer().notNull(),
})

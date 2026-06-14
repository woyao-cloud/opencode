/**
 * storage/schema.sql - SQL 表基 Schema：公用的时间戳字段定义
 *
 * 功能概述：
 * - 定义公用的 Timestamps 字段（time_created、time_updated）
 * - 提供自动的创建时间和更新时间管理
 *
 * 核心导出：
 * - Timestamps：时间戳字段定义
 *
 * 架构位置：Storage 模块 Schema 基类，被各业务表的 SQL Schema 引用。
 */
import { integer } from "drizzle-orm/sqlite-core"

export const Timestamps = {
  time_created: integer()
    .notNull()
    .$default(() => Date.now()),
  time_updated: integer()
    .notNull()
    .$onUpdate(() => Date.now()),
}

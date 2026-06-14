/**
 * storage/db.bun - Bun 数据库初始化：使用 Bun SQLite 创建 drizzle 数据库实例
 *
 * 功能概述：
 * - 使用 bun:sqlite 作为 SQLite 驱动
 * - 初始化 drizzle ORM 实例
 *
 * 核心导出：
 * - init：根据路径创建数据库实例
 *
 * 架构位置：Storage 模块平台适配层，Bun 运行时专用。
 */
import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"

export function init(path: string) {
  const sqlite = new Database(path, { create: true })
  const db = drizzle({ client: sqlite })
  return db
}

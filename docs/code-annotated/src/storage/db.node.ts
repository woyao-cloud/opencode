/**
 * storage/db.node - Node.js 数据库初始化：使用 Node SQLite 创建 drizzle 数据库实例
 *
 * 功能概述：
 * - 使用 node:sqlite 作为 SQLite 驱动
 * - 初始化 drizzle ORM 实例
 *
 * 核心导出：
 * - init：根据路径创建数据库实例
 *
 * 架构位置：Storage 模块平台适配层，Node.js 运行时专用。
 */
import { DatabaseSync } from "node:sqlite"
import { drizzle } from "drizzle-orm/node-sqlite"

export function init(path: string) {
  const sqlite = new DatabaseSync(path)
  const db = drizzle({ client: sqlite })
  return db
}

/**
 * [account/account.sql] - Account 数据表定义
 * 功能概述：定义 AccountTable（账户表）、AccountStateTable（账户状态表）、ControlAccountTable（遗留控制账户表）的数据库结构
 * 核心导出：AccountTable, AccountStateTable, ControlAccountTable
 * 架构位置：storage layer，依赖 drizzle-orm/sqlite-core
 */

import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core"

import { type AccessToken, type AccountID, type OrgID, type RefreshToken } from "./schema"
import { Timestamps } from "../storage/schema.sql"

export const AccountTable = sqliteTable("account", {
  id: text().$type<AccountID>().primaryKey(),
  email: text().notNull(),
  url: text().notNull(),
  access_token: text().$type<AccessToken>().notNull(),
  refresh_token: text().$type<RefreshToken>().notNull(),
  token_expiry: integer(),
  ...Timestamps,
})

export const AccountStateTable = sqliteTable("account_state", {
  id: integer().primaryKey(),
  active_account_id: text()
    .$type<AccountID>()
    .references(() => AccountTable.id, { onDelete: "set null" }),
  active_org_id: text().$type<OrgID>(),
})

// LEGACY
export const ControlAccountTable = sqliteTable(
  "control_account",
  {
    email: text().notNull(),
    url: text().notNull(),
    access_token: text().$type<AccessToken>().notNull(),
    refresh_token: text().$type<RefreshToken>().notNull(),
    token_expiry: integer(),
    active: integer({ mode: "boolean" })
      .notNull()
      .$default(() => false),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.email, table.url] })],
)

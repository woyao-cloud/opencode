/**
 * [config/server] - 服务器配置模块
 *
 * 功能概述：
 * - 定义 HTTP 服务器的配置 Schema（端口、主机名、mDNS、CORS）
 *
 * 核心导出：
 * - Server：服务器配置 Schema
 *
 * 架构位置：下游被 config/config.ts 引用
 */
import { Schema } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"

export const Server = Schema.Struct({
  port: Schema.optional(PositiveInt).annotate({
    description: "Port to listen on",
  }),
  hostname: Schema.optional(Schema.String).annotate({ description: "Hostname to listen on" }),
  mdns: Schema.optional(Schema.Boolean).annotate({ description: "Enable mDNS service discovery" }),
  mdnsDomain: Schema.optional(Schema.String).annotate({
    description: "Custom domain name for mDNS service (default: opencode.local)",
  }),
  cors: Schema.optional(Schema.mutable(Schema.Array(Schema.String))).annotate({
    description: "Additional domains to allow for CORS",
  }),
}).annotate({ identifier: "ServerConfig" })
export type Server = Schema.Schema.Type<typeof Server>

export * as ConfigServer from "./server"

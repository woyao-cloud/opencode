/**
 * server/event - 服务端事件定义
 *
 * 功能概述：
 * - 定义服务端生命周期相关事件（连接等）
 *
 * 核心导出：
 * - Event：包含 Connected 等事件 Schema
 *
 * 架构位置：被 global-lifecycle 等服务端模块引用，基于 BusEvent 构建
 */

import { BusEvent } from "@/bus/bus-event"
import { Schema } from "effect"

export const Event = {
  Connected: BusEvent.define("server.connected", Schema.Struct({})),
  Disposed: BusEvent.define("global.disposed", Schema.Struct({})),
}

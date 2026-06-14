/**
 * [bus/global] - 全局事件总线
 *
 * 功能概述：
 * - 基于 Node.js EventEmitter 的全局事件总线实现
 * - 自动为事件载荷分配 ID（如果缺少）
 *
 * 核心导出：
 * - GlobalBus：全局事件总线单例
 * - GlobalEvent：全局事件类型定义
 *
 * 架构位置：上游依赖 Node.js events；下游被 bus/index.ts、sync/index.ts 引用
 */
import { EventEmitter } from "events"
import { Identifier } from "@/id/id"

export type GlobalEvent = {
  directory?: string
  project?: string
  workspace?: string
  payload: any
}

class GlobalBusEmitter extends EventEmitter<{
  event: [GlobalEvent]
}> {
  override emit(eventName: "event", event: GlobalEvent): boolean {
    if (event.payload && typeof event.payload === "object" && !("id" in event.payload)) {
      event.payload.id = event.payload.syncEvent?.id ?? Identifier.create("evt", "ascending")
    }
    return super.emit(eventName, event)
  }
}

export const GlobalBus = new GlobalBusEmitter()

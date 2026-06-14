/**
 * cli/cmd/tui/context/event - SDK 事件订阅上下文
 * 功能概述：- 提供事件订阅机制，过滤 SDK 事件并按项目/工作区分发
 * 核心导出：- useEvent(): 返回 subscribe 和 on 方法
 * 架构位置：TUI 上下文层
 */
import type { Event } from "@opencode-ai/sdk/v2"
import { useProject } from "./project"
import { useSDK } from "./sdk"

type EventMetadata = {
  workspace: string | undefined
}

export function useEvent() {
  const project = useProject()
  const sdk = useSDK()

  function subscribe(handler: (event: Event, metadata: EventMetadata) => void) {
    return sdk.event.on("event", (event) => {
      if (event.payload.type === "sync") {
        return
      }

      if (event.directory === "global" || event.project === project.project()) {
        handler(event.payload, { workspace: event.workspace })
      }
    })
  }

  function on<T extends Event["type"]>(
    type: T,
    handler: (event: Extract<Event, { type: T }>, metadata: EventMetadata) => void,
  ) {
    return subscribe((event: Event, metadata: EventMetadata) => {
      if (event.type !== type) return
      handler(event as Extract<Event, { type: T }>, metadata)
    })
  }

  return {
    subscribe,
    on,
  }
}

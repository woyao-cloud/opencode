/**
 * [effect/instance-ref] - 实例引用 Context 定义
 *
 * 功能概述：
 * - 定义 InstanceRef 和 WorkspaceRef 的 Effect Context 引用
 * - 提供实例和工作区上下文的运行时存取
 *
 * 核心导出：
 * - InstanceRef：实例上下文引用
 * - WorkspaceRef：工作区 ID 引用
 *
 * 架构位置：上游依赖 Effect Context；下游被 bridge.ts、instance-state.ts、run-service.ts 引用
 */
import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceID } from "@/control-plane/schema"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~opencode/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceID | undefined>("~opencode/WorkspaceRef", {
  defaultValue: () => undefined,
})

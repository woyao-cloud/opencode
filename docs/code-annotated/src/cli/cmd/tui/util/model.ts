/**
 * cli/cmd/tui/util/model.ts - 模型查询工具
 * 功能概述：从 Provider 列表中索引和查询模型信息
 * 核心导出：index, get, name
 * 架构位置：TUI 组件
 */
import type { Provider } from "@opencode-ai/sdk/v2"

export function index(list: Provider[] | undefined) {
  return new Map((list ?? []).map((item) => [item.id, item] as const))
}

export function get(list: Provider[] | ReadonlyMap<string, Provider> | undefined, providerID: string, modelID: string) {
  const provider =
    list instanceof Map
      ? list.get(providerID)
      : Array.isArray(list)
        ? list.find((item) => item.id === providerID)
        : undefined
  return provider?.models[modelID]
}

export function name(
  list: Provider[] | ReadonlyMap<string, Provider> | undefined,
  providerID: string,
  modelID: string,
) {
  return get(list, providerID, modelID)?.name ?? modelID
}

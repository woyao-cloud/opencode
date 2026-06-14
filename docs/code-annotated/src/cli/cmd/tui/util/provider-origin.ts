/**
 * cli/cmd/tui/util/provider-origin.ts - Provider 来源判断
 * 功能概述：判断指定 Provider 是否由控制台管理
 * 核心导出：isConsoleManagedProvider
 * 架构位置：TUI 组件
 */
const contains = (consoleManagedProviders: string[] | ReadonlySet<string>, providerID: string) =>
  Array.isArray(consoleManagedProviders)
    ? consoleManagedProviders.includes(providerID)
    : consoleManagedProviders.has(providerID)

export const isConsoleManagedProvider = (consoleManagedProviders: string[] | ReadonlySet<string>, providerID: string) =>
  contains(consoleManagedProviders, providerID)

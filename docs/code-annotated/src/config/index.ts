/**
 * [config/index] - 配置模块的统一导出入口
 *
 * 功能概述：
 * - 重新导出 config 模块的所有公共类型和函数
 * - 提供配置模块的单一引用入口
 *
 * 核心导出：
 * - 所有 config 模块的公共类型、接口和函数
 *
 * 架构位置：位于 config 层的最顶层，供其他模块统一引用
 */

export { ConfigManager, loadConfig } from "./config";
export type {
  OpenCodeConfig,
  ProviderConfig,
  WorkspaceConfig,
  SyncConfig,
  ContextConfig,
} from "./config";

export { WorkspaceManager, resolveWorkspaceFiles } from "./workspace";

export { ProviderRegistry, getProvider, registerProvider } from "./providers";

export { ContextManager, estimateTokens } from "./context";
export type { CompressionStrategy } from "./context";

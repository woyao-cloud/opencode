/**
 * cli/cmd/tui/layer - TUI Effect 层组合
 *
 * 功能概述：
 * - 组合 TuiConfig、Npm、Observability 等 Effect 层为统一的 CliLayer
 *
 * 核心导出：
 * - CliLayer: 合并后的 Effect Layer，供 TUI 应用引导使用
 *
 * 架构位置：TUI 依赖注入层，将配置/基础设施层组合为单一 Layer 供应用使用
 */

import { Layer } from "effect"
import { TuiConfig } from "./config/tui"
import { Npm } from "@opencode-ai/core/npm"
import { Observability } from "@opencode-ai/core/effect/observability"

export const CliLayer = Observability.layer.pipe(Layer.merge(TuiConfig.layer), Layer.provide(Npm.defaultLayer))

/**
 * cli/cmd/tui/util/scroll.ts - 滚动加速工具
 * 功能概述：提供自定义滚动速度和 macOS 风格滚动加速实现
 * 核心导出：CustomSpeedScroll, getScrollAcceleration
 * 架构位置：TUI 组件
 */
import { MacOSScrollAccel, type ScrollAcceleration } from "@opentui/core"
import type { TuiConfig } from "@/cli/cmd/tui/config/tui"

export class CustomSpeedScroll implements ScrollAcceleration {
  constructor(private speed: number) {}

  tick(_now?: number): number {
    return this.speed
  }

  reset(): void {}
}

export function getScrollAcceleration(
  tuiConfig?: Pick<TuiConfig.Info, "scroll_acceleration" | "scroll_speed">,
): ScrollAcceleration {
  if (tuiConfig?.scroll_acceleration?.enabled) {
    return new MacOSScrollAccel()
  }
  if (tuiConfig?.scroll_speed !== undefined) {
    return new CustomSpeedScroll(tuiConfig.scroll_speed)
  }

  return new CustomSpeedScroll(3)
}

/**
 * cli/cmd/tui/component/spinner - 加载动画组件
 *
 * 功能概述：
 * - 提供 TUI 加载旋转动画组件
 * - 支持自定义帧序列和主题颜色
 *
 * 核心导出：
 * - Spinner: SolidJS 加载动画组件
 * - SPINNER_FRAMES: 动画帧字符数组
 *
 * 架构位置：TUI 组件层，被多个 UI 组件用于加载状态展示
 */

import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import "opentui-spinner/solid"

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.textMuted
  return (
    <Show when={kv.get("animations_enabled", true)} fallback={<text fg={color()}>⋯ {props.children}</text>}>
      <box flexDirection="row" gap={1}>
        <spinner frames={SPINNER_FRAMES} interval={80} color={color()} />
        <Show when={props.children}>
          <text fg={color()}>{props.children}</text>
        </Show>
      </box>
    </Show>
  )
}

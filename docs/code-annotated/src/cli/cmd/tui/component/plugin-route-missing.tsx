/**
 * cli/cmd/tui/component/plugin-route-missing - 插件路由缺失提示组件
 *
 * 功能概述：
 * - 当插件路由未找到时显示友好提示
 * - 提供 "go home" 返回按钮
 *
 * 核心导出：
 * - PluginRouteMissing: SolidJS 组件
 *
 * 架构位置：TUI 组件层，被 app.tsx 的路由匹配 fallback 使用
 */

import { useTheme } from "../context/theme"

export function PluginRouteMissing(props: { id: string; onHome: () => void }) {
  const { theme } = useTheme()

  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center" flexDirection="column" gap={1}>
      <text fg={theme.warning}>Unknown plugin route: {props.id}</text>
      <box onMouseUp={props.onHome} backgroundColor={theme.backgroundElement} paddingLeft={1} paddingRight={1}>
        <text fg={theme.text}>go home</text>
      </box>
    </box>
  )
}

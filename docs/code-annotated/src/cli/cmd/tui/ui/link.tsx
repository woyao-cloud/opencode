/**
 * cli/cmd/tui/ui/link.tsx - 超链接组件
 * 功能概述：渲染可点击的超链接文本，点击在默认浏览器中打开 URL
 * 核心导出：Link, LinkProps
 * 架构位置：TUI 组件
 */
import type { JSX } from "solid-js"
import type { RGBA } from "@opentui/core"
import open from "open"

export interface LinkProps {
  href: string
  children?: JSX.Element | string
  fg?: RGBA
  bg?: RGBA
  width?: number | "auto" | `${number}%`
  wrapMode?: "word" | "none"
}

/**
 * Link component that renders clickable hyperlinks.
 * Clicking anywhere on the link text opens the URL in the default browser.
 */
export function Link(props: LinkProps) {
  const displayText = props.children ?? props.href

  return (
    <text
      fg={props.fg}
      bg={props.bg}
      width={props.width}
      wrapMode={props.wrapMode}
      onMouseUp={() => {
        open(props.href).catch(() => {})
      }}
    >
      {displayText}
    </text>
  )
}

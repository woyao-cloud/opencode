/**
 * cli/cmd/tui/context/helper - 简单上下文工具函数
 * 功能概述：- 提供 createSimpleContext 工厂函数，简化 SolidJS Context 的创建
 * 核心导出：- createSimpleContext(input): 返回 provider 和 use Hook
 * 架构位置：TUI 上下文工具层
 */
import { createContext, Show, useContext, type ParentProps } from "solid-js"

export function createSimpleContext<T, Props extends Record<string, any>>(input: {
  name: string
  init: ((input: Props) => T) | (() => T)
}) {
  const ctx = createContext<T>()

  return {
    provider: (props: ParentProps<Props>) => {
      const init = input.init(props)
      return (
        // @ts-expect-error
        <Show when={init.ready === undefined || init.ready === true}>
          <ctx.Provider value={init}>{props.children}</ctx.Provider>
        </Show>
      )
    },
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error(`${input.name} context must be used within a context provider`)
      return value
    },
  }
}

/**
 * cli/cmd/cmd - yargs 命令模块包装器
 *
 * 功能概述：
 * - 提供 cmd() 包装函数，简化 yargs CommandModule 的类型定义
 * - 导出 WithDoubleDash 工具类型，支持 "--" 参数捕获
 *
 * 核心导出：
 * - cmd<T, U>(input): 类型安全的 yargs 命令模块包装函数
 * - WithDoubleDash<T>: 在泛型 T 上添加可选 "--" 字符串数组字段
 *
 * 架构位置：被 cli/effect-cmd.ts 及各类具体命令文件引用，处于 CLI 命令注册的最底层抽象
 */

import type { CommandModule } from "yargs"

export type WithDoubleDash<T> = T & { "--"?: string[] }

export function cmd<T, U>(input: CommandModule<T, WithDoubleDash<U>>) {
  return input
}

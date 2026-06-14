/**
 * cli/cmd/tui/component/prompt/traits - 提示特性类型定义
 *
 * 功能概述：
 * - 定义提示输入的模式（normal/shell）和编辑器特性类型
 *
 * 核心导出：
 * - PromptMode: 提示模式类型
 * - PromptTraits / PromptTraitsInput: 提示特性接口
 *
 * 架构位置：TUI 组件层，被 prompt/index.tsx 和 autocomplete 引用
 */

import type { EditorTraits } from "@opentui/core"

export type PromptMode = "normal" | "shell"

export interface PromptTraitsInput {
  mode: PromptMode
  autocompleteVisible: boolean
}

export type PromptTraits = EditorTraits & {
  owner: "opencode"
  role: "prompt"
}

/**
 * Compute the textarea editor traits for the prompt.
 *
 * The OpenTUI managed textarea keymap owns `traits.suspend`. Prompt traits
 * only expose capture/status metadata so focus changes cannot unsuspend the
 * keymap-managed editor mappings.
 */
export function computePromptTraits(input: PromptTraitsInput): PromptTraits {
  const capture =
    input.mode === "normal"
      ? input.autocompleteVisible
        ? (["escape", "navigate", "submit", "tab"] as const)
        : (["tab"] as const)
      : undefined
  return {
    capture,
    status: input.mode === "shell" ? "SHELL" : undefined,
    owner: "opencode",
    role: "prompt",
  }
}

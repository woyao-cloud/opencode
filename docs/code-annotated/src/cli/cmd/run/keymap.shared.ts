/**
 * cli/cmd/run/keymap.shared.ts - 键盘映射与快捷键绑定
 *
 * 功能概述：
 * - 使用 OpenTUI Keymap 定义交互模式的快捷键绑定
 * - 注册默认按键和 leader 键序列
 * - 提供绑定格式化和键序列展示工具函数
 *
 * 核心导出：
 * - createRunKeymap: 创建运行模式键盘映射
 * - formatKeySequence / formatCommandBindings: 格式化工具
 *
 * 架构位置：CLI run 命令子模块的输入层，
 * 被 runtime.boot 和 footer 用于处理键盘输入
 */
import { KeyEvent } from "@opentui/core"
import { Keymap, type Binding, type KeySequencePart } from "@opentui/keymap"
import { registerDefaultKeys, registerLeader } from "@opentui/keymap/addons"
import { formatCommandBindings, formatKeySequence } from "@opentui/keymap/extras"

type ParsedBindingInput = Pick<Binding, "key" | "event">

export type ParsedBinding = {
  sequence: KeySequencePart[]
  event: "press" | "release"
}

const keyNameAliases = {
  delete: "del",
  enter: "return",
  escape: "esc",
  pagedown: "pgdn",
  pageup: "pgup",
} as const

const modifierAliases = {
  meta: "alt",
} as const

function hostPlatform() {
  if (process.platform === "darwin") {
    return "macos" as const
  }

  if (process.platform === "win32") {
    return "windows" as const
  }

  if (process.platform === "linux") {
    return "linux" as const
  }

  return "unknown" as const
}

function createCommandEvent() {
  return new KeyEvent({
    name: "command",
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    number: false,
    raw: "",
    eventType: "press",
    source: "raw",
  })
}

function createParser(leader: string) {
  const platform = hostPlatform()
  const keymap = new Keymap({
    metadata: {
      platform,
      primaryModifier: platform === "macos" ? "super" : platform === "unknown" ? "unknown" : "ctrl",
      modifiers: {
        ctrl: "supported",
        shift: "supported",
        meta: "supported",
        super: "unknown",
        hyper: "unknown",
      },
    },
    rootTarget: {},
    isDestroyed: false,
    getFocusedTarget() {
      return null
    },
    getParentTarget(_target) {
      return null
    },
    isTargetDestroyed(_target) {
      return false
    },
    onKeyPress(_listener) {
      return () => {}
    },
    onKeyRelease(_listener) {
      return () => {}
    },
    onFocusChange(_listener) {
      return () => {}
    },
    onTargetDestroy(_target, _listener) {
      return () => {}
    },
    createCommandEvent,
  })

  const offDefault = registerDefaultKeys(keymap)
  const offLeader = registerLeader(keymap, { trigger: leader })

  return {
    keymap,
    dispose() {
      offLeader()
      offDefault()
    },
  }
}

function formatOptions(leader: string) {
  return {
    tokenDisplay: {
      leader,
    },
    keyNameAliases,
    modifierAliases,
  } as const
}

function splitBinding(binding: ParsedBindingInput) {
  if (typeof binding.key !== "string" || !binding.key.includes(",")) {
    return [binding]
  }

  return binding.key
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .map((key) => ({
      ...binding,
      key,
    }))
}

export function parseBindings(bindings: readonly ParsedBindingInput[], leader: string): ParsedBinding[] {
  const parser = createParser(leader)

  try {
    return bindings.flatMap((binding) =>
      splitBinding(binding).map((item) => ({
        sequence: Array.from(parser.keymap.parseKeySequence(item.key)),
        event: item.event ?? "press",
      })),
    )
  } finally {
    parser.dispose()
  }
}

export function formatBinding(bindings: readonly ParsedBindingInput[], leader: string) {
  return formatKeySequence(parseBindings(bindings, leader)[0]?.sequence, formatOptions(leader))
}

export function formatBindings(bindings: readonly ParsedBindingInput[], leader: string) {
  return formatCommandBindings(parseBindings(bindings, leader), formatOptions(leader))
}

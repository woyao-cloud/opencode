/**
 * cli/cmd/tui/component/dialog-skill - Skill 选择对话框
 *
 * 功能概述：
 * - 提供 TUI Skill 选择对话框组件
 * - 列出可用 Skill 并支持选择触发
 *
 * 核心导出：
 * - DialogSkill: SolidJS Skill 选择对话框组件
 *
 * 架构位置：TUI 组件
 */
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { createResource, createMemo } from "solid-js"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "@tui/context/sdk"

export type DialogSkillProps = {
  onSelect: (skill: string) => void
}

export function DialogSkill(props: DialogSkillProps) {
  const dialog = useDialog()
  const sdk = useSDK()
  dialog.setSize("large")

  const [skills] = createResource(async () => {
    const result = await sdk.client.app.skills()
    return result.data ?? []
  })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const list = skills() ?? []
    const maxWidth = Math.max(0, ...list.map((s) => s.name.length))
    return list.map((skill) => ({
      title: skill.name.padEnd(maxWidth),
      description: skill.description?.replace(/\s+/g, " ").trim(),
      value: skill.name,
      category: "Skills",
      onSelect: () => {
        props.onSelect(skill.name)
        dialog.clear()
      },
    }))
  })

  return <DialogSelect title="Skills" placeholder="Search skills..." options={options()} />
}

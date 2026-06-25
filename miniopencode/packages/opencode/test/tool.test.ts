/**
 * test/tool.test.ts — 工具模块测试
 */

import { expect, test } from "bun:test"
import { EditTool } from "../src/tool/edit"

test("EditTool has correct name and description", () => {
  expect(EditTool.name).toBe("edit")
  expect(EditTool.description).toContain("编辑文件")
})

test("EditTool has required parameters", () => {
  const params = EditTool.parameters
  expect(params.required).toContain("file_path")
  expect(params.required).toContain("old_string")
  expect(params.required).toContain("new_string")
})

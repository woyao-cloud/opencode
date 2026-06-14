/**
 * permission/schema - 权限 ID Schema：定义权限标识符类型
 *
 * 功能概述：
 * - 定义 PermissionID 新类型，以 "per" 前缀开头
 * - 提供自增 ID 生成方法
 *
 * 核心导出：
 * - PermissionID：权限标识符新类型
 *
 * 架构位置：权限模块 Schema 层，被 permission/index.ts 服务层使用。
 * 上游依赖：id/id（ID 生成器）
 */
import { Schema } from "effect"

import { Identifier } from "@/id/id"
import { Newtype } from "@opencode-ai/core/schema"

export class PermissionID extends Newtype<PermissionID>()(
  "PermissionID",
  Schema.String.check(Schema.isStartsWith("per")),
) {
  static ascending(id?: string): PermissionID {
    return this.make(Identifier.ascending("permission", id))
  }
}

/**
 * [question/schema] - 提问 ID 类型定义
 * 功能概述：定义 QuestionID 的 branded 类型和升序生成方法
 * 核心导出：QuestionID
 * 架构位置：domain types layer，被 question/index.ts 依赖
 */

import { Schema } from "effect"

import { Identifier } from "@/id/id"
import { Newtype } from "@opencode-ai/core/schema"

export class QuestionID extends Newtype<QuestionID>()("QuestionID", Schema.String.check(Schema.isStartsWith("que"))) {
  static ascending(id?: string): QuestionID {
    return this.make(Identifier.ascending("question", id))
  }
}

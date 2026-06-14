/**
 * [config/attachment] - 附件配置模块
 *
 * 功能概述：
 * - 定义图像附件的配置 Schema（自动缩放、最大尺寸、Base64 载荷限制）
 *
 * 核心导出：
 * - Image：图像附件配置 Schema
 * - Info：附件配置顶层 Schema
 *
 * 架构位置：位于 config 层，被 config.ts 的 Info Schema 引用
 */
export * as ConfigAttachment from "./attachment"

import { Schema } from "effect"
import { PositiveInt } from "@opencode-ai/core/schema"

export const Image = Schema.Struct({
  auto_resize: Schema.optional(Schema.Boolean).annotate({
    description: "Resize images before sending them to the model when they exceed configured limits (default: true)",
  }),
  max_width: Schema.optional(PositiveInt).annotate({
    description: "Maximum image width before resizing or rejecting the attachment (default: 2000)",
  }),
  max_height: Schema.optional(PositiveInt).annotate({
    description: "Maximum image height before resizing or rejecting the attachment (default: 2000)",
  }),
  max_base64_bytes: Schema.optional(PositiveInt).annotate({
    description: "Maximum base64 payload bytes for an image attachment (default: 5242880)",
  }),
}).annotate({ identifier: "ImageAttachmentConfig" })
export type Image = Schema.Schema.Type<typeof Image>

export const Info = Schema.Struct({
  image: Schema.optional(Image).annotate({ description: "Image attachment configuration" }),
}).annotate({ identifier: "AttachmentConfig" })
export type Info = Schema.Schema.Type<typeof Info>

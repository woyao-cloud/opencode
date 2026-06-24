/**
 * 05-api-types.ts — API 类型系统
 *
 * 演示如何使用 Schema 构建完整的 API 类型系统，
 * 包括请求 Schema、响应 Schema、事件 Schema（可区分联合）、错误 Schema。
 * 参考 OpenCode LLM 事件系统的 Schema 设计模式。
 * 运行: bun run src/05-api-types.ts
 */

import { Schema, SchemaTransformation, Effect } from "effect"
import * as S from "effect/Schema"

// ============================================================
// 1. 请求 Schema
// ============================================================

console.log("=== 1. 请求 Schema ===")

// 定义 API 请求的 Schema
const CreateUserRequest = Schema.Struct({
  name: Schema.String.pipe(
    Schema.check(Schema.isMinLength(2)),
    Schema.check(Schema.isMaxLength(50))
  ),
  email: Schema.String,
  age: Schema.optional(
    Schema.Number.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))
  ),
})

type CreateUserRequest = typeof CreateUserRequest.Type

// 合法请求
const validRequest = Schema.decodeUnknownSync(CreateUserRequest)({
  name: "张三",
  email: "zhangsan@example.com",
  age: 28,
})
console.log("合法请求:", validRequest)

// 非法请求
try {
  Schema.decodeUnknownSync(CreateUserRequest)({
    name: "A", // 太短
    email: "invalid",
  })
} catch (err) {
  console.log("非法请求被拒绝:", (err as Error).message)
}

// ============================================================
// 2. 响应 Schema
// ============================================================

console.log("\n=== 2. 响应 Schema ===")

const ApiResponse = Schema.Struct({
  success: Schema.Boolean,
  message: Schema.String,
  data: Schema.optional(Schema.Unknown),
})

type ApiResponse = typeof ApiResponse.Type

const successResponse = Schema.decodeUnknownSync(ApiResponse)({
  success: true,
  message: "操作成功",
  data: { id: "user-123" },
})
console.log("成功响应:", successResponse)

const errorResponse = Schema.decodeUnknownSync(ApiResponse)({
  success: false,
  message: "用户不存在",
})
console.log("错误响应:", errorResponse)

// ============================================================
// 3. 事件 Schema (可区分联合) — 参考 OpenCode LLM 事件系统
// ============================================================

console.log("\n=== 3. 事件 Schema (可区分联合) ===")

// OpenCode 中 LLM 事件使用 type 字段做区分
// 这里模拟一个简化的 LLM 事件系统

// 注意: 使用 Schema.Struct 而非 TaggedStruct
// 因为 TaggedStruct 会自动添加 _tag 字段
// 而 OpenCode 风格的事件使用 type 字段做区分

// 事件开始
const StepStart = Schema.Struct({
  type: Schema.Literal("step-start"),
  stepId: Schema.String,
  timestamp: Schema.Number,
})

// 文本增量
const TextDelta = Schema.Struct({
  type: Schema.Literal("text-delta"),
  id: Schema.String,
  text: Schema.String,
})

// 工具调用
const ToolCall = Schema.Struct({
  type: Schema.Literal("tool-call"),
  toolName: Schema.String,
  args: Schema.Record(Schema.String, Schema.Unknown),
})

// 步骤结束
const StepFinish = Schema.Struct({
  type: Schema.Literal("step-finish"),
  stepId: Schema.String,
  result: Schema.String,
})

// 组合为可区分联合
const LLMEvent = Schema.Union([
  StepStart,
  TextDelta,
  ToolCall,
  StepFinish,
]).pipe(Schema.toTaggedUnion("type"))

type LLMEvent = typeof LLMEvent.Type

// 解码不同类型的事件
const event1 = Schema.decodeUnknownSync(LLMEvent)({
  type: "step-start",
  stepId: "step-001",
  timestamp: Date.now(),
})
console.log("StepStart 事件:", event1)

const event2 = Schema.decodeUnknownSync(LLMEvent)({
  type: "text-delta",
  id: "block-001",
  text: "Hello, world!",
})
console.log("TextDelta 事件:", event2)

const event3 = Schema.decodeUnknownSync(LLMEvent)({
  type: "tool-call",
  toolName: "get_weather",
  args: { city: "北京" },
})
console.log("ToolCall 事件:", event3)

// ============================================================
// 4. 错误 Schema
// ============================================================

console.log("\n=== 4. 错误 Schema ===")

// 定义 API 错误类型
const ValidationError = Schema.Struct({
  _tag: Schema.Literal("ValidationError"),
  field: Schema.String,
  message: Schema.String,
})

const NotFoundError = Schema.Struct({
  _tag: Schema.Literal("NotFoundError"),
  resource: Schema.String,
  id: Schema.String,
})

const InternalError = Schema.Struct({
  _tag: Schema.Literal("InternalError"),
  message: Schema.String,
  requestId: Schema.optional(Schema.String),
})

// 组合为错误联合
const ApiError = Schema.Union([
  ValidationError,
  NotFoundError,
  InternalError,
]).pipe(Schema.toTaggedUnion("_tag"))

type ApiError = typeof ApiError.Type

// 解码不同类型的错误
const err1 = Schema.decodeUnknownSync(ApiError)({
  _tag: "ValidationError",
  field: "email",
  message: "邮箱格式不正确",
})
console.log("校验错误:", err1)

const err2 = Schema.decodeUnknownSync(ApiError)({
  _tag: "NotFoundError",
  resource: "User",
  id: "user-999",
})
console.log("未找到错误:", err2)

// ============================================================
// 5. Schema 作为"单一真相源"
// ============================================================

console.log("\n=== 5. Schema 作为单一真相源 ===")

// 在一个地方定义 Schema，同时获得:
// 1. TypeScript 类型
// 2. 运行时校验
// 3. 序列化/反序列化

const OrderSchema = Schema.Struct({
  orderId: Schema.String,
  product: Schema.String,
  quantity: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0))
  ),
  price: Schema.NumberFromString, // 外部 string, 内部 number
})

// TypeScript 类型
type Order = typeof OrderSchema.Type
type OrderEncoded = typeof OrderSchema.Encoded

// 运行时校验
const order = Schema.decodeUnknownSync(OrderSchema)({
  orderId: "ORD-001",
  product: "Effect-TS 指南",
  quantity: 2,
  price: "99.90",
})
console.log("订单解码:", order)
console.log("价格类型 (内部):", typeof order.price)

// 序列化
const orderJson = Schema.encodeSync(OrderSchema)(order)
console.log("订单编码:", orderJson)
console.log("价格类型 (外部):", typeof orderJson.price)

// ============================================================
// 6. 完整 API 流程
// ============================================================

console.log("\n=== 6. 完整 API 流程 ===")

// 模拟一个完整的 API 请求-响应-错误处理流程
function processApiRequest(input: unknown): string {
  // 1. 校验请求
  const request = Schema.decodeUnknownSync(CreateUserRequest)(input)

  // 2. 处理业务逻辑 (模拟)
  const userId = `user-${Date.now()}`

  // 3. 构建响应
  const response = {
    success: true,
    message: `用户 ${request.name} 创建成功`,
    data: { id: userId },
  }

  return JSON.stringify(response)
}

// 成功流程
try {
  const result = processApiRequest({
    name: "Alice",
    email: "alice@example.com",
    age: 25,
  })
  console.log("API 成功:", result)
} catch (err) {
  console.log("API 失败:", (err as Error).message)
}

// 失败流程
try {
  processApiRequest({
    name: "A", // 太短
    email: "invalid",
  })
} catch (err) {
  console.log("API 校验失败:", (err as Error).message)
}

console.log("\n✅ 05-api-types.ts 运行完成")

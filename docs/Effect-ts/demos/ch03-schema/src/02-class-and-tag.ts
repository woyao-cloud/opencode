/**
 * 02-class-and-tag.ts — Schema.Class 与 Schema.Tag
 *
 * 演示 Schema.Class（类风格定义）、带 _tag 的错误类模式（参考 OpenCode Usage）、
 * Schema.TaggedStruct（带 tag 的结构体）、以及类的实例化与方法定义。
 * 运行: bun run src/02-class-and-tag.ts
 *
 * 注意: beta.65 中 Schema.TaggedErrorClass 在 Bun 下有构造函数兼容问题，
 * 改用 Schema.Class + 显式 _tag 字段实现相同的 tagged error 模式。
 */

import { Schema } from "effect"

// ============================================================
// 1. Schema.Class — 类风格定义
// ============================================================

console.log("=== 1. Schema.Class — 类风格定义 ===")

// Schema.Class 将 Schema 定义与类绑定，一个定义同时获得：
//   - 运行时校验（decode/decodeUnknownSync）
//   - TypeScript 类型（User.Type）
//   - 构造函数（new User({...})）
//   - 实例方法
class User extends Schema.Class<User>("User")({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  email: Schema.String,
}) {
  // 可以在类上定义实例方法
  get displayName(): string {
    return `${this.name} (${this.age}岁)`
  }

  get isAdult(): boolean {
    return this.age >= 18
  }

  // 静态工厂方法
  static from(input: unknown): User {
    return Schema.decodeUnknownSync(User)(input)
  }
}

// 使用构造函数创建实例
const user = new User({ name: "张三", age: 28, email: "zhangsan@example.com" })
console.log("用户实例:", user)
console.log("  displayName:", user.displayName)
console.log("  isAdult:", user.isAdult)

// 使用静态工厂从 unknown 数据创建
const user2 = User.from({ name: "李四", age: 25, email: "lisi@example.com" })
console.log("\n工厂方法创建:", user2.displayName)

// 验证：非法年龄被拒绝
try {
  User.from({ name: "王五", age: -5, email: "wangwu@example.com" })
} catch (err) {
  console.log("非法年龄被拒绝:", (err as Error).message)
}

// ============================================================
// 2. 带 _tag 的错误类 — Schema.Class + 显式 _tag
// ============================================================

console.log("\n=== 2. 带 _tag 的错误类 ===")

// beta.65 中 TaggedErrorClass 在 Bun 下有构造函数兼容问题，
// 改用 Schema.Class + 显式 _tag 字段实现相同的 tagged error 模式。
// 这与 OpenCode 中 Usage 类的模式一致：
//   class Usage extends Schema.Class<Usage>("LLM.Usage")({...}) { ... }

class ValidationError extends Schema.Class<ValidationError>("ValidationError")({
  _tag: Schema.Literal("ValidationError"),
  message: Schema.String,
  field: Schema.optional(Schema.String),
  value: Schema.optional(Schema.Unknown),
}) {
  // 实例方法
  get description(): string {
    const fieldInfo = this.field ? ` 字段: ${this.field}` : ""
    const valueInfo = this.value !== undefined ? ` 值: ${JSON.stringify(this.value)}` : ""
    return `[${this._tag}] ${this.message}${fieldInfo}${valueInfo}`
  }

  // 静态便捷构造
  static forField(field: string, message: string, value?: unknown): ValidationError {
    return new ValidationError({ _tag: "ValidationError", message, field, value })
  }
}

class NotFoundError extends Schema.Class<NotFoundError>("NotFoundError")({
  _tag: Schema.Literal("NotFoundError"),
  message: Schema.String,
  resource: Schema.String,
  id: Schema.String,
}) {
  get description(): string {
    return `[${this._tag}] ${this.resource} ${this.id} 不存在: ${this.message}`
  }
}

// 创建错误实例
const err1 = ValidationError.forField("email", "邮箱格式不正确", "invalid-email")
console.log("ValidationError:", err1.description)
console.log("  _tag:", err1._tag)

const err2 = new NotFoundError({
  _tag: "NotFoundError",
  message: "用户未找到",
  resource: "User",
  id: "42",
})
console.log("\nNotFoundError:", err2.description)
console.log("  _tag:", err2._tag)

// ============================================================
// 3. Schema.TaggedStruct — 带 tag 的结构体
// ============================================================

console.log("\n=== 3. Schema.TaggedStruct — 带 tag 的结构体 ===")

// TaggedStruct 在输入数据中也需要 _tag 字段，
// 因为 _tag 被视为结构体的普通字段。
// 调用方式: Schema.TaggedStruct(tagString, { ...fields })

const OrderCreated = Schema.TaggedStruct("OrderCreated", {
  orderId: Schema.String,
  amount: Schema.Number,
})

const OrderCancelled = Schema.TaggedStruct("OrderCancelled", {
  orderId: Schema.String,
  reason: Schema.String,
})

// 解码时 _tag 必须作为字段提供
const created = Schema.decodeUnknownSync(OrderCreated)({
  _tag: "OrderCreated",
  orderId: "ORD-001",
  amount: 99.9,
})
console.log("OrderCreated:", created)
console.log("  _tag:", created._tag)

const cancelled = Schema.decodeUnknownSync(OrderCancelled)({
  _tag: "OrderCancelled",
  orderId: "ORD-002",
  reason: "用户取消",
})
console.log("\nOrderCancelled:", cancelled)
console.log("  _tag:", cancelled._tag)

// TaggedStruct 的典型用法：配合 toTaggedUnion 创建可区分联合
const OrderEvent = Schema.Union([OrderCreated, OrderCancelled]).pipe(
  Schema.toTaggedUnion("_tag")
)

// 现在可以从 unknown 数据中自动识别类型
const event1 = Schema.decodeUnknownSync(OrderEvent)({
  _tag: "OrderCreated",
  orderId: "ORD-003",
  amount: 199.9,
})
console.log("\n联合类型识别 (OrderCreated):", event1._tag, event1)

const event2 = Schema.decodeUnknownSync(OrderEvent)({
  _tag: "OrderCancelled",
  orderId: "ORD-004",
  reason: "库存不足",
})
console.log("联合类型识别 (OrderCancelled):", event2._tag, event2)

// ============================================================
// 4. Schema.Class 与普通 class + decorator 的对比
// ============================================================

console.log("\n=== 4. Class 模式对比 ===")

// Schema.Class 方式：类型定义和校验在一起
class Product extends Schema.Class<Product>("Product")({
  name: Schema.String,
  price: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
}) {
  get formattedPrice(): string {
    return `¥${this.price.toFixed(2)}`
  }
}

// 对比：普通 TypeScript class（无运行时校验）
class PlainProduct {
  constructor(
    readonly name: string,
    readonly price: number,
  ) {}
  get formattedPrice(): string {
    return `¥${this.price.toFixed(2)}`
  }
}

// Schema.Class 提供运行时校验
try {
  new Product({ name: "测试", price: -10 })
} catch (err) {
  console.log("Schema.Class 校验: 负价格被拒绝")
}

// 普通 class 不校验
const plain = new PlainProduct("测试", -10)
console.log("普通 class 无校验: price =", plain.price, "（接受了负值）")

// ============================================================
// 5. OpenCode 模式参考 — Schema.Class 生产级用法
// ============================================================

console.log("\n=== 5. OpenCode 模式参考 ===")

// 参考 OpenCode 中 Usage 类的模式（packages/llm/src/schema/events.ts）：
//   class Usage extends Schema.Class<Usage>("LLM.Usage")({
//     inputTokens: Schema.optional(Schema.Number),
//     outputTokens: Schema.optional(Schema.Number),
//     ...
//   }) {
//     get visibleOutputTokens() { ... }
//     static from(input: UsageInput) { ... }
//   }
//
// 核心模式：
//   1. Schema.Class 定义数据结构 + 运行时校验
//   2. getter 提供计算属性
//   3. 静态方法提供便捷构造

class TokenUsage extends Schema.Class<TokenUsage>("TokenUsage")({
  inputTokens: Schema.Number,
  outputTokens: Schema.Number,
  reasoningTokens: Schema.optional(Schema.Number),
}) {
  // 计算属性：可见输出 token（排除推理 token）
  get visibleOutputTokens(): number {
    return Math.max(0, this.outputTokens - (this.reasoningTokens ?? 0))
  }

  get totalTokens(): number {
    return this.inputTokens + this.outputTokens
  }

  // 静态工厂方法
  static from(input: unknown): TokenUsage {
    return Schema.decodeUnknownSync(TokenUsage)(input)
  }
}

const usage = TokenUsage.from({
  inputTokens: 1500,
  outputTokens: 800,
  reasoningTokens: 200,
})
console.log("TokenUsage:")
console.log("  inputTokens:", usage.inputTokens)
console.log("  outputTokens:", usage.outputTokens)
console.log("  reasoningTokens:", usage.reasoningTokens)
console.log("  visibleOutputTokens:", usage.visibleOutputTokens)
console.log("  totalTokens:", usage.totalTokens)

console.log("\n✅ 02-class-and-tag.ts 运行完成")

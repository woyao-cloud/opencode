/**
 * 04-type-inference.ts — Schema 与 TypeScript 类型双向推导
 *
 * 演示 typeof schema.Type（Schema → TS 类型）、typeof schema.Encoded（编码类型）、
 * Schema.toStandardSchemaV1（Standard Schema 规范兼容）、以及 Schema 作为"单一真相源"。
 * 运行: bun run src/04-type-inference.ts
 */

import { Schema } from "effect"

// ============================================================
// 1. typeof schema.Type — Schema → TypeScript 类型
// ============================================================

console.log("=== 1. Schema → TypeScript 类型推导 ===")

const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  email: Schema.String,
  role: Schema.Literal("admin", "user", "moderator"),
  tags: Schema.Array(Schema.String),
  metadata: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown)
  ),
})

// typeof schema.Type — 从 Schema 推导 TypeScript 类型
type User = typeof UserSchema.Type
// User 等价于:
// {
//   readonly name: string
//   readonly age: number
//   readonly email: string
//   readonly role: "admin" | "user" | "moderator"
//   readonly tags: readonly string[]
//   readonly metadata?: { readonly [x: string]: unknown }
// }

// TypeScript 会在编译时检查类型
function formatUser(user: User): string {
  // 编译器知道 user.role 是 "admin" | "user" | "moderator"
  const roleLabel = { admin: "管理员", user: "用户", moderator: "版主" }[user.role]
  return `${user.name} (${roleLabel}, ${user.age}岁)`
}

// 运行时校验确保数据符合类型
const user = Schema.decodeUnknownSync(UserSchema)({
  name: "张三",
  age: 28,
  email: "zhangsan@example.com",
  role: "admin",
  tags: ["frontend", "react"],
})
console.log(formatUser(user))

// ============================================================
// 2. typeof schema.Encoded — 编码类型
// ============================================================

console.log("\n=== 2. typeof schema.Encoded — 编码类型 ===")

// 当 Schema 包含变换（如 NumberFromString）时，Type 和 Encoded 不同
const AgeFromString = Schema.NumberFromString

// Type 是变换后的类型（number）
type Age = typeof AgeFromString.Type  // number

// Encoded 是变换前的类型（string）
type AgeEncoded = typeof AgeFromString.Encoded  // string

console.log("NumberFromString.Type 是 number 类型")
console.log("NumberFromString.Encoded 是 string 类型")

// 演示 Type vs Encoded 的实际差异
const ProductSchema = Schema.Struct({
  name: Schema.String,
  price: Schema.NumberFromString, // 编码时是 string，解码后是 number
})

type Product = typeof ProductSchema.Type
// { readonly name: string; readonly price: number }

type ProductEncoded = typeof ProductSchema.Encoded
// { readonly name: string; readonly price: string }

// 解码：string → number
const product = Schema.decodeUnknownSync(ProductSchema)({
  name: "Effect-TS 指南",
  price: "99.90", // 注意：这是 string！
})
console.log("解码后 price 类型:", typeof product.price, product.price)

// 编码：number → string
const encoded = Schema.encodeSync(ProductSchema)(product)
console.log("编码后 price 类型:", typeof encoded.price, encoded.price)

// ============================================================
// 3. Schema.toStandardSchemaV1 — Standard Schema 兼容
// ============================================================

console.log("\n=== 3. Standard Schema V1 兼容 ===")

// toStandardSchemaV1 将 Effect Schema 转为符合 Standard Schema 规范的格式，
// 以便与其他兼容该规范的库（如 Zod、Valibot 等）互操作。

const standardSchema = Schema.toStandardSchemaV1(UserSchema)
console.log("Standard Schema 版本:", standardSchema.version)
console.log("Standard Schema 厂商:", standardSchema.vendor)
console.log("Standard Schema 类型:", typeof standardSchema.validate)

// 使用 Standard Schema 接口进行校验
const stdResult = standardSchema.validate({
  name: "李四",
  age: 30,
  email: "lisi@example.com",
  role: "user",
  tags: ["backend"],
})
console.log("Standard Schema 校验结果:", stdResult)

// 非法数据也会被拒绝
const stdFail = standardSchema.validate({
  name: "王五",
  age: -1,  // 非法年龄
  email: "wangwu@example.com",
  role: "admin",
  tags: [],
})
console.log("Standard Schema 拒绝非法数据:", "issues" in stdFail ? "有校验错误" : "无校验错误")

// ============================================================
// 4. Schema 作为"单一真相源"
// ============================================================

console.log("\n=== 4. Schema 作为单一真相源 ===")

// 传统方式：类型定义和校验规则分离
// interface User { ... }        ← 类型定义（编译时）
// function validate(input) { }  ← 校验逻辑（运行时）
// 问题：两者可能不同步！

// Schema 方式：类型和校验在一处定义
const OrderSchema = Schema.Struct({
  orderId: Schema.String,
  amount: Schema.Number.pipe(
    Schema.check(Schema.isGreaterThan(0)),
  ),
  currency: Schema.Literal("CNY", "USD", "EUR"),
  items: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      quantity: Schema.Number.pipe(
        Schema.check(Schema.isGreaterThan(0)),
        Schema.check(Schema.isInt()),
      ),
      price: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
    })
  ),
})

// 一处定义，多处使用：
// 1. TypeScript 类型（编译时检查）
type Order = typeof OrderSchema.Type

// 2. 运行时校验
function processOrder(raw: unknown): Order {
  return Schema.decodeUnknownSync(OrderSchema)(raw)
}

// 3. 序列化
function serializeOrder(order: Order): string {
  return JSON.stringify(Schema.encodeSync(OrderSchema)(order))
}

// 4. 数据清洗（自定义逻辑 + Schema 校验）
function validateAndClean(raw: unknown): Order {
  // 如果数据是 JSON 字符串，先解析
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  // Schema 校验
  return Schema.decodeUnknownSync(OrderSchema)(parsed)
}

// 测试"单一真相源"
const rawOrder = {
  orderId: "ORD-2024-001",
  amount: 299.9,
  currency: "CNY",
  items: [
    { name: "Effect-TS 实战", quantity: 2, price: 99.9 },
    { name: "TypeScript 进阶", quantity: 1, price: 100.1 },
  ],
}

const order = processOrder(rawOrder)
console.log("处理订单:", order.orderId)
console.log("  金额:", order.amount, order.currency)
console.log("  商品数:", order.items.length)
console.log("  序列化:", serializeOrder(order))

// 非法数据被拒绝
try {
  processOrder({ orderId: "X", amount: -50, currency: "JPY" as any, items: [] })
} catch (err) {
  console.log("\n非法订单被拒绝:", (err as Error).message)
}

// ============================================================
// 5. 类型推导的边界案例
// ============================================================

console.log("\n=== 5. 类型推导边界案例 ===")

// Schema.optional 在 Type 和 Encoded 上的不同表现
const WithOptional = Schema.Struct({
  required: Schema.String,
  optional: Schema.optional(Schema.Number),
})

type WithOptionalType = typeof WithOptional.Type
// { readonly required: string; readonly optional?: number }

// 嵌套结构的类型推导
const NestedSchema = Schema.Struct({
  user: Schema.Struct({
    name: Schema.String,
    profile: Schema.Struct({
      bio: Schema.optional(Schema.String),
      links: Schema.Array(Schema.String),
    }),
  }),
})

type Nested = typeof NestedSchema.Type
// 深层嵌套的类型自动推导

const nested: Nested = Schema.decodeUnknownSync(NestedSchema)({
  user: {
    name: "张三",
    profile: {
      links: ["https://github.com/zhangsan"],
    },
  },
})
console.log("嵌套结构推导正确:", nested.user.name, "-", nested.user.profile.links[0])

console.log("\n✅ 04-type-inference.ts 运行完成")

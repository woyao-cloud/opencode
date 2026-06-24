/**
 * 02-transform.ts — Schema 变换 (Transform)
 *
 * 演示 SchemaTransformation.transform / transformOrFail 创建自定义变换，
 * 以及 decodeTo 将变换应用到 Schema 上。
 * 运行: bun run src/02-transform.ts
 */

import { Schema, SchemaTransformation, Effect } from "effect"
import * as S from "effect/Schema"

// ============================================================
// 1. 基础变换: string ↔ number
// ============================================================

console.log("=== 1. 基础变换: string ↔ number ===")

// 使用 SchemaTransformation.transform 创建变换
// decode: 外部格式 → 内部格式
// encode: 内部格式 → 外部格式
const StringToNumberTrans = SchemaTransformation.transform({
  decode: (s: string) => parseInt(s, 10),
  encode: (n: number) => n.toString(),
})

// 使用 decodeTo 将变换应用到 Schema 上
// String.pipe(decodeTo(Number, trans)) 表示:
//   外部是 String, 内部是 Number, 通过 trans 变换
const StringToNumber = Schema.String.pipe(
  S.decodeTo(Schema.Number, StringToNumberTrans)
)

// 解码: string → number
const decoded = Schema.decodeUnknownSync(StringToNumber)("42")
console.log("解码 '42':", decoded, typeof decoded)

// 编码: number → string
const encoded = Schema.encodeSync(StringToNumber)(42)
console.log("编码 42:", encoded, typeof encoded)

// 类型推导
type Decoded = typeof StringToNumber.Type     // number
type Encoded = typeof StringToNumber.Encoded  // string
console.log("Type 是 number:", true as Decoded extends number ? true : false)
console.log("Encoded 是 string:", true as Encoded extends string ? true : false)

// ============================================================
// 2. 实际场景: string ↔ Date
// ============================================================

console.log("\n=== 2. 实际场景: string ↔ Date ===")

const DateFromStringTrans = SchemaTransformation.transform({
  decode: (s: string) => new Date(s),
  encode: (d: Date) => d.toISOString(),
})

const DateFromString = Schema.String.pipe(
  S.decodeTo(Schema.Date, DateFromStringTrans)
)

const dateDecoded = Schema.decodeUnknownSync(DateFromString)("2024-06-15T00:00:00.000Z")
console.log("解码日期:", dateDecoded, dateDecoded instanceof Date)

const dateEncoded = Schema.encodeSync(DateFromString)(new Date("2024-06-15"))
console.log("编码日期:", dateEncoded, typeof dateEncoded)

// ============================================================
// 3. transformOrFail — 可失败的变换
// ============================================================

console.log("\n=== 3. transformOrFail — 可失败的变换 ===")

// transformOrFail 的 decode/encode 返回 Effect
// 成功返回 Effect.succeed(value)，失败返回 Effect.fail(error)
const SafeParseIntTrans = SchemaTransformation.transformOrFail({
  decode: (s: string) => {
    const n = parseInt(s, 10)
    if (isNaN(n)) return Effect.fail(`无法将 "${s}" 解析为整数`)
    return Effect.succeed(n)
  },
  encode: (n: number) => Effect.succeed(n.toString()),
})

const SafeParseInt = Schema.String.pipe(
  S.decodeTo(Schema.Number, SafeParseIntTrans)
)

// 合法输入
const valid = Schema.decodeUnknownSync(SafeParseInt)("123")
console.log("合法输入 '123':", valid)

// 非法输入 — 会抛出包含自定义错误信息的异常
try {
  Schema.decodeUnknownSync(SafeParseInt)("abc")
} catch (err) {
  console.log("非法输入 'abc' 被拒绝:", (err as Error).message)
}

// ============================================================
// 4. 实际场景: snake_case ↔ camelCase 字段变换
// ============================================================

console.log("\n=== 4. snake_case ↔ camelCase 字段变换 ===")

// 定义 snake_case 的外部 Schema
const SnakeUser = Schema.Struct({
  first_name: Schema.String,
  last_name: Schema.String,
  email_address: Schema.String,
})

// 定义 camelCase 的内部 Schema
const CamelUser = Schema.Struct({
  firstName: Schema.String,
  lastName: Schema.String,
  emailAddress: Schema.String,
})

// 创建字段名变换
const SnakeToCamelTrans = SchemaTransformation.transform({
  decode: (input: any) => ({
    firstName: input.first_name,
    lastName: input.last_name,
    emailAddress: input.email_address,
  }),
  encode: (input: any) => ({
    first_name: input.firstName,
    last_name: input.lastName,
    email_address: input.emailAddress,
  }),
})

const SnakeToCamel = SnakeUser.pipe(
  S.decodeTo(CamelUser, SnakeToCamelTrans)
)

// 解码: snake_case → camelCase
const camelUser = Schema.decodeUnknownSync(SnakeToCamel)({
  first_name: "Alice",
  last_name: "Smith",
  email_address: "alice@example.com",
})
console.log("解码后 (camelCase):", camelUser)

// 编码: camelCase → snake_case
const snakeUser = Schema.encodeSync(SnakeToCamel)({
  firstName: "Bob",
  lastName: "Jones",
  emailAddress: "bob@example.com",
})
console.log("编码后 (snake_case):", snakeUser)

// ============================================================
// 5. 内建变换 Schema 的使用
// ============================================================

console.log("\n=== 5. 内建变换 Schema ===")

// beta.65 提供了一些内建的变换 Schema
// NumberFromString: string ↔ number
const price = Schema.decodeUnknownSync(Schema.NumberFromString)("99.90")
console.log("NumberFromString 解码:", price, typeof price)

const priceStr = Schema.encodeSync(Schema.NumberFromString)(99.90)
console.log("NumberFromString 编码:", priceStr, typeof priceStr)

// 在 Struct 中使用内建变换
const ProductSchema = Schema.Struct({
  name: Schema.String,
  price: Schema.NumberFromString,  // 外部是 string，内部是 number
})

const product = Schema.decodeUnknownSync(ProductSchema)({
  name: "Effect-TS 指南",
  price: "99.90",
})
console.log("产品解码:", product)
// price 现在是 number 类型
console.log("价格类型:", typeof product.price)

// 编码回传输格式
const productEncoded = Schema.encodeSync(ProductSchema)(product)
console.log("产品编码:", productEncoded)
// price 变回 string
console.log("价格类型:", typeof productEncoded.price)

console.log("\n✅ 02-transform.ts 运行完成")

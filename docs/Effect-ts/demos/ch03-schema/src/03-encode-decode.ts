/**
 * 03-encode-decode.ts — 序列化与反序列化
 *
 * 学习目标: 掌握 Schema 的编解码操作，理解 Type（解码后类型）与 Encoded（编码类型）
 *          的区别，学会 JSON 往返和自定义 transform
 * 前置章节: 第 2 章（Effect 类型入门）
 * 运行方式: bun run src/03-encode-decode.ts
 */

import { Schema } from "effect"

// ============================================================
// 1. Type vs Encoded — 两个关键类型概念
// ============================================================
// 每个 Schema 有两个关联类型:
//   - Type (解码后类型): 校验通过后的"干净"类型，用于业务逻辑
//   - Encoded (编码类型): 原始输入/输出类型，用于 JSON 序列化
//
// 对于简单 Schema (如 Schema.String)，Type === Encoded。
// 对于带 transform 的 Schema，两者可能不同。

const SimpleSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

// Type 和 Encoded 相同（没有 transform）
type SimpleType = Schema.Schema.Type<typeof SimpleSchema>
type SimpleEncoded = Schema.Codec.Encoded<typeof SimpleSchema>

console.log("--- 1. Type vs Encoded ---")
console.log("对于简单 Schema (无 transform):")
console.log("  Type === Encoded (两者相同)")

// ============================================================
// 2. Schema.decodeUnknownSync — 从 unknown 解码
// ============================================================
// decodeUnknownSync 接受 unknown 输入，校验并返回 Type。
// 这是最常用的解码方式，因为外部数据（API 响应、用户输入）通常是 unknown。

const rawData: unknown = JSON.parse('{"name":"Alice","age":30}')

const decoded = Schema.decodeUnknownSync(SimpleSchema)(rawData)
console.log("\n--- 2. Schema.decodeUnknownSync ---")
console.log("原始数据 (unknown):", rawData)
console.log("解码后 (Type):", decoded)
console.log("类型安全访问:", decoded.name.toUpperCase(), decoded.age + 1)

// ============================================================
// 3. Schema.encodeSync — 编码为 Encoded 类型
// ============================================================
// encodeSync 将 Type 转换为 Encoded 类型。
// 对于简单 Schema，encodeSync 基本是"原样返回"。

const encoded = Schema.encodeSync(SimpleSchema)(decoded)
console.log("\n--- 3. Schema.encodeSync ---")
console.log("编码后 (Encoded):", encoded)
console.log("编码后 JSON:", JSON.stringify(encoded))

// ============================================================
// 4. JSON 往返 — 完整的序列化/反序列化流程
// ============================================================
// 典型流程: JSON 字符串 → unknown → decode → Type → encode → Encoded → JSON 字符串

const ProductSchema = Schema.Struct({
  id: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  name: Schema.String,
  price: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  tags: Schema.Array(Schema.String),
  inStock: Schema.Boolean,
})

console.log("\n--- 4. JSON 往返 ---")

// 模拟从 API 收到的 JSON
const apiResponse = `{
  "id": 101,
  "name": "Effect-TS 实战指南",
  "price": 49.9,
  "tags": ["typescript", "functional", "effect"],
  "inStock": true
}`

console.log("步骤 1: JSON 字符串")
console.log("  ", apiResponse.trim())

// 步骤 2: JSON.parse → unknown
const raw: unknown = JSON.parse(apiResponse)
console.log("步骤 2: JSON.parse → unknown")

// 步骤 3: decodeUnknownSync → Type (校验 + 类型安全)
const product = Schema.decodeUnknownSync(ProductSchema)(raw)
console.log("步骤 3: decodeUnknownSync → Type (校验通过)")
console.log("  product.name:", product.name)
console.log("  product.price:", product.price)
console.log("  product.tags:", product.tags)

// 步骤 4: encodeSync → Encoded
const backToEncoded = Schema.encodeSync(ProductSchema)(product)
console.log("步骤 4: encodeSync → Encoded")

// 步骤 5: JSON.stringify → JSON 字符串
const backToJson = JSON.stringify(backToEncoded, null, 2)
console.log("步骤 5: JSON.stringify → JSON 字符串")
console.log(backToJson)

// 验证往返一致性
const reDecoded = Schema.decodeUnknownSync(ProductSchema)(JSON.parse(backToJson))
console.log("往返验证: 重新解码后的 name =", reDecoded.name)

// ============================================================
// 5. 自定义 transform — 数据清洗
// ============================================================
// Schema.transform 或 Schema.compose 可以在编解码过程中转换数据。
// 常见场景: 字符串 ↔ 数字、日期字符串 ↔ Date 对象、数据清洗。

// 5.1 字符串数字 → 数字 (NumberFromString 模式)
const TrimmedString = Schema.String.pipe(
  Schema.check((s) => s.trim().length > 0, { message: () => "字符串不能为空或全空白" })
)

// 5.2 使用 Schema.compose 进行类型转换
// compose: 从 A 解码到 B，从 B 编码回 A
const NumberFromString = Schema.compose(Schema.String, Schema.Number, {
  decode: (s) => {
    const n = Number(s)
    if (Number.isNaN(n)) {
      throw new Error(`无法将 "${s}" 转换为数字`)
    }
    return n
  },
  encode: (n) => String(n),
})

console.log("\n--- 5. 自定义 transform ---")

// 解码: 字符串 → 数字
const num1 = Schema.decodeUnknownSync(NumberFromString)("42")
console.log("NumberFromString 解码 '42' →", num1, `(type: ${typeof num1})`)

// 编码: 数字 → 字符串
const str1 = Schema.encodeSync(NumberFromString)(num1)
console.log("NumberFromString 编码 42 →", str1, `(type: ${typeof str1})`)

// 非法输入
try {
  Schema.decodeUnknownSync(NumberFromString)("not-a-number")
} catch (err) {
  console.log("非法输入 'not-a-number':", (err as Error).message)
}

// 5.3 日期字符串 ↔ Date 对象
const DateFromString = Schema.compose(Schema.String, Schema.Date, {
  decode: (s) => {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) {
      throw new Error(`无法将 "${s}" 解析为日期`)
    }
    return d
  },
  encode: (d) => d.toISOString(),
})

console.log("\n日期字符串 ↔ Date 对象:")
const date = Schema.decodeUnknownSync(DateFromString)("2024-01-15T08:30:00Z")
console.log("  解码 '2024-01-15T08:30:00Z' →", date)
console.log("  date.getFullYear():", date.getFullYear())

const dateStr = Schema.encodeSync(DateFromString)(date)
console.log("  编码 Date →", dateStr)

// ============================================================
// 6. Schema.decodeUnknown — Effect 版本（异步解码）
// ============================================================
// decodeUnknown 返回 Effect，支持异步校验场景。
// 这里演示同步使用，但 API 设计支持异步。

import { Effect } from "effect"

console.log("\n--- 6. Schema.decodeUnknown (Effect 版本) ---")

const program = Effect.gen(function* () {
  const raw: unknown = JSON.parse('{"name":"Alice","age":30}')
  const user = yield* Schema.decodeUnknown(SimpleSchema)(raw)
  return user
})

Effect.runPromise(program).then((user) => {
  console.log("Effect 版本解码结果:", user)
})

// ============================================================
// 7. 总结
// ============================================================
console.log("\n--- 7. 总结 ---")
console.log("┌──────────────────────────┬─────────────────────────────────┐")
console.log("│ API                      │ 用途                            │")
console.log("├──────────────────────────┼─────────────────────────────────┤")
console.log("│ Schema.decodeUnknownSync │ unknown → Type (同步)          │")
console.log("│ Schema.decodeSync        │ Encoded → Type (同步)          │")
console.log("│ Schema.encodeSync        │ Type → Encoded (同步)          │")
console.log("│ Schema.decodeUnknown     │ unknown → Type (Effect/异步)   │")
console.log("│ Schema.encodeUnknown     │ Type → Encoded (Effect/异步)  │")
console.log("│ Schema.compose           │ 类型转换 (A ↔ B)              │")
console.log("│ Schema.Schema.Type       │ 提取 TypeScript 类型          │")
console.log("│ Schema.Codec.Encoded     │ 提取编码类型                   │")
console.log("└──────────────────────────┴─────────────────────────────────┘")
console.log("\n关键理解:")
console.log("  - Type 是业务逻辑使用的类型，Encoded 是序列化/传输类型")
console.log("  - 简单 Schema 的 Type === Encoded")
console.log("  - 带 transform 的 Schema 的 Type !== Encoded")
console.log("  - JSON 往返: JSON → unknown → decode → Type → encode → Encoded → JSON")
console.log("  - Schema.compose 实现自定义类型转换（如字符串↔数字、字符串↔日期）")

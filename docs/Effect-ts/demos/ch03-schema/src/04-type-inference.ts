/**
 * 04-type-inference.ts — Schema 与 TypeScript 类型双向推导
 *
 * 学习目标: 掌握 Schema → TypeScript 类型的提取方式，理解 Type 与 Encoded 的区别，
 *          了解 Standard Schema 兼容性，建立"Schema 作为单一真相源"的理念
 * 前置章节: 第 2 章（Effect 类型入门）
 * 运行方式: bun run src/04-type-inference.ts
 */

import { Schema } from "effect"

// ============================================================
// 1. Schema.Schema.Type — Schema → TypeScript 类型
// ============================================================
// Schema.Schema.Type<typeof schema> 从 Schema 提取解码后的 TypeScript 类型。
// 这是"单一真相源"的核心: 类型定义和校验规则在同一处维护。

const BookSchema = Schema.Struct({
  title: Schema.String,
  author: Schema.String,
  year: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  genres: Schema.Array(Schema.String),
  rating: Schema.optional(Schema.Number.pipe(
    Schema.check(Schema.isGreaterThanOrEqualTo(0)),
    Schema.check((n) => n <= 5, { message: () => "评分必须在 0-5 之间" })
  )),
})

// 从 Schema 提取 TypeScript 类型 — 不需要手动写 interface！
type Book = Schema.Schema.Type<typeof BookSchema>
// type Book = {
//   readonly title: string
//   readonly author: string
//   readonly year: number
//   readonly genres: readonly string[]
//   readonly rating?: number
// }

console.log("--- 1. Schema.Schema.Type ---")
console.log("BookSchema 定义了完整的 Book 类型:")
console.log("  - title: string")
console.log("  - author: string")
console.log("  - year: number (> 0)")
console.log("  - genres: string[]")
console.log("  - rating?: number (0-5)")
console.log("\n无需手动编写 interface Book { ... }")
console.log("类型定义 + 校验规则 = 同一处维护 = 单一真相源")

// 使用提取的类型
function formatBook(book: Book): string {
  return `《${book.title}》- ${book.author} (${book.year})`
}

const validBook = Schema.decodeUnknownSync(BookSchema)({
  title: "Effect-TS 实战",
  author: "OpenCode 团队",
  year: 2024,
  genres: ["typescript", "functional"],
  rating: 4.5,
})
console.log("\n格式化输出:", formatBook(validBook))

// ============================================================
// 2. Schema.Codec.Encoded — Schema → 编码类型
// ============================================================
// Schema.Codec.Encoded<typeof schema> 提取编码类型（原始输入类型）。
// 对于带 transform 的 Schema，Encoded 与 Type 不同。

// 2.1 简单 Schema: Type === Encoded
const SimpleSchema = Schema.Struct({
  name: Schema.String,
  count: Schema.Number,
})
type SimpleType = Schema.Schema.Type<typeof SimpleSchema>
type SimpleEncoded = Schema.Codec.Encoded<typeof SimpleSchema>
// SimpleType === SimpleEncoded (两者相同)

console.log("\n--- 2. Schema.Codec.Encoded ---")
console.log("简单 Schema (无 transform):")
console.log("  Type === Encoded")

// 2.2 带 transform 的 Schema: Type !== Encoded
const NumberFromString = Schema.compose(Schema.String, Schema.Number, {
  decode: (s) => {
    const n = Number(s)
    if (Number.isNaN(n)) throw new Error(`无法将 "${s}" 转换为数字`)
    return n
  },
  encode: (n) => String(n),
})

type NFSType = Schema.Schema.Type<typeof NumberFromString>    // number
type NFSEncoded = Schema.Codec.Encoded<typeof NumberFromString> // string

console.log("\n带 transform 的 Schema (NumberFromString):")
console.log("  Type (解码后): number — 业务逻辑中使用的类型")
console.log("  Encoded (编码): string — JSON/API 传输的类型")

// 验证
const nfsValue = Schema.decodeUnknownSync(NumberFromString)("42")
console.log("  解码 '42' →", nfsValue, `(typeof: ${typeof nfsValue})`)
const nfsEncoded = Schema.encodeSync(NumberFromString)(nfsValue)
console.log("  编码 42 →", nfsEncoded, `(typeof: ${typeof nfsEncoded})`)

// ============================================================
// 3. Schema.toStandardSchemaV1 — Standard Schema 兼容
// ============================================================
// Effect-TS Schema 支持 Standard Schema v1 规范。
// toStandardSchemaV1 将 Effect Schema 转换为标准接口，
// 使其可被其他支持该规范的库使用。

console.log("\n--- 3. Schema.toStandardSchemaV1 ---")

const standardSchema = Schema.toStandardSchemaV1(BookSchema, {
  references: true,
  definitions: true,
})

// Standard Schema v1 接口提供 ~standard 属性
const standardValidate = standardSchema["~standard"].validate

// 校验合法数据
const validResult = standardValidate({
  title: "测试书籍",
  author: "作者",
  year: 2024,
  genres: ["test"],
})
console.log("Standard Schema 校验合法数据:", validResult)

// 校验非法数据
const invalidResult = standardValidate({
  title: "测试书籍",
  author: "作者",
  year: -1,           // 不满足 > 0
  genres: ["test"],
})
console.log("Standard Schema 校验非法数据:", invalidResult)

console.log("\nStandard Schema v1 的意义:")
console.log("  - 跨库互操作: 其他支持该规范的库可以直接使用 Effect Schema")
console.log("  - 标准化接口: ~standard.validate 统一校验入口")
console.log("  - 生态兼容: 不锁定在 Effect-TS 生态内")

// ============================================================
// 4. Schema 作为"单一真相源"
// ============================================================
// 传统方式: 类型定义 (interface) + 校验逻辑 (zod/joi) 分开维护
// Schema 方式: 类型定义和校验规则在同一处，从 Schema 提取类型

console.log("\n--- 4. Schema 作为单一真相源 ---")

// 传统方式的问题演示
console.log("传统方式:")
console.log("  // 步骤 1: 定义 TypeScript 类型")
console.log("  interface User {")
console.log("    name: string")
console.log("    age: number")
console.log("  }")
console.log("  // 步骤 2: 定义校验规则 (zod/yup/joi)")
console.log("  const userSchema = z.object({")
console.log("    name: z.string(),")
console.log("    age: z.number().positive(),")
console.log("  })")
console.log("  // 问题: 类型和校验分开维护，容易不同步")
console.log("  // 修改类型时可能忘记更新校验规则")

console.log("\nSchema 方式:")
console.log("  const UserSchema = Schema.Struct({")
console.log("    name: Schema.String,")
console.log("    age: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),")
console.log("  })")
console.log("  type User = Schema.Schema.Type<typeof UserSchema>")
console.log("  // 优势: 类型和校验在同一处定义，永不不同步")

// 实际演示
const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
})
type User = Schema.Schema.Type<typeof UserSchema>

// 类型安全: 编译器知道 user.name 是 string, user.age 是 number
const user = Schema.decodeUnknownSync(UserSchema)({ name: "Alice", age: 30 })
const greeting: string = `Hello, ${user.name}! You are ${user.age} years old.`
console.log("\n类型安全使用:", greeting)

// ============================================================
// 5. 高级类型提取 — 嵌套与联合
// ============================================================
// Schema.Schema.Type 可以提取任意复杂 Schema 的类型。

const AddressSchema = Schema.Struct({
  street: Schema.String,
  city: Schema.String,
  zipCode: Schema.optional(Schema.String),
})

const ContactSchema = Schema.Struct({
  user: UserSchema,
  address: AddressSchema,
  phones: Schema.Array(Schema.String),
})

type Contact = Schema.Schema.Type<typeof ContactSchema>
// type Contact = {
//   readonly user: User
//   readonly address: { readonly street: string; readonly city: string; readonly zipCode?: string }
//   readonly phones: readonly string[]
// }

console.log("\n--- 5. 高级类型提取 ---")
const contact = Schema.decodeUnknownSync(ContactSchema)({
  user: { name: "Bob", age: 25 },
  address: { street: "123 Main St", city: "TechCity" },
  phones: ["+1-555-0100", "+1-555-0101"],
})
console.log("嵌套类型提取:")
console.log("  contact.user.name:", contact.user.name)
console.log("  contact.address.city:", contact.address.city)
console.log("  contact.phones:", contact.phones)

// ============================================================
// 6. 总结
// ============================================================
console.log("\n--- 6. 总结 ---")
console.log("┌──────────────────────────────┬─────────────────────────────────┐")
console.log("│ 类型提取方式                 │ 用途                            │")
console.log("├──────────────────────────────┼─────────────────────────────────┤")
console.log("│ Schema.Schema.Type<S>        │ 提取解码后类型 (业务逻辑使用)   │")
console.log("│ Schema.Codec.Encoded<S>     │ 提取编码类型 (传输/序列化)      │")
console.log("│ Schema.toStandardSchemaV1   │ 转换为 Standard Schema v1 格式  │")
console.log("└──────────────────────────────┴─────────────────────────────────┘")
console.log("\n关键理解:")
console.log("  - Schema 是单一真相源: 类型定义 + 校验规则一处维护")
console.log("  - Schema.Schema.Type 从 Schema 提取 TypeScript 类型")
console.log("  - Schema.Codec.Encoded 提取编码类型 (与 Type 可能不同)")
console.log("  - 带 transform 的 Schema: Type !== Encoded")
console.log("  - Standard Schema v1 支持跨库互操作")
console.log("  - 修改 Schema 时，TypeScript 类型自动更新 — 永不不同步")

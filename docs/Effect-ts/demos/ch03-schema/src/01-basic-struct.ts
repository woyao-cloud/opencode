/**
 * 01-basic-struct.ts — Schema.Struct 基础
 *
 * 演示 Schema.Struct 定义数据结构、字段校验、以及同步解码。
 * 运行: bun run src/01-basic-struct.ts
 */

import { Schema } from "effect"

// ============================================================
// 1. Schema.Struct — 定义数据结构
// ============================================================

// 定义一个用户 Schema
const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})

// Schema 同时生成 TypeScript 类型
type User = typeof UserSchema.Type

console.log("=== 1. Schema.Struct 基础 ===")

// 使用 decodeUnknownSync 从 unknown 数据解码（运行时会校验）
const validUser = Schema.decodeUnknownSync(UserSchema)({
  name: "张三",
  age: 28,
  email: "zhangsan@example.com",
})
console.log("合法数据解码成功:", validUser)

// ============================================================
// 2. Schema.optional — 可选字段
// ============================================================

console.log("\n=== 2. Schema.optional ===")

const ProfileSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  bio: Schema.optional(Schema.String), // 可选字段
})

type Profile = typeof ProfileSchema.Type

const profile1 = Schema.decodeUnknownSync(ProfileSchema)({
  name: "李四",
  age: 25,
  // bio 缺失 — 合法
})
console.log("缺少可选字段 — 通过:", profile1)

const profile2 = Schema.decodeUnknownSync(ProfileSchema)({
  name: "王五",
  age: 30,
  bio: "全栈开发者", // 提供了可选字段
})
console.log("包含可选字段 — 通过:", profile2)

// ============================================================
// 3. Schema.Literal — 字面量类型
// ============================================================

console.log("\n=== 3. Schema.Literal ===")

const StatusSchema = Schema.Struct({
  name: Schema.String,
  status: Schema.Literal("active", "inactive", "suspended"),
})

const validStatus = Schema.decodeUnknownSync(StatusSchema)({
  name: "赵六",
  status: "active",
})
console.log("合法状态:", validStatus)

try {
  Schema.decodeUnknownSync(StatusSchema)({
    name: "钱七",
    status: "deleted", // 非法值！
  })
} catch (err) {
  console.log("非法状态被拒绝:", (err as Error).message)
}

// ============================================================
// 4. Schema.Array 与 Schema.Record — 集合类型
// ============================================================

console.log("\n=== 4. Schema.Array 与 Schema.Record ===")

const TeamSchema = Schema.Struct({
  name: Schema.String,
  members: Schema.Array(Schema.String),         // 字符串数组
  metadata: Schema.Record(Schema.String, Schema.Unknown), // 字符串键 → 任意值
})

const team = Schema.decodeUnknownSync(TeamSchema)({
  name: "前端团队",
  members: ["张三", "李四", "王五"],
  metadata: {
    department: "engineering",
    sprint: 42,
    lead: "张三",
  },
})
console.log("团队数据:", JSON.stringify(team, null, 2))

// ============================================================
// 5. 数值约束 — Schema.check 配合 Schema.is* 谓词
// ============================================================

console.log("\n=== 5. 数值约束 ===")

// Schema.isGreaterThan 是谓词函数，配合 Schema.check 使用
const PositiveNumber = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThan(0))
)

const AgeRange = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.check(Schema.isLessThanOrEqualTo(150))
)

const ProductSchema = Schema.Struct({
  name: Schema.String,
  price: PositiveNumber,
  quantity: AgeRange,
})

const product = Schema.decodeUnknownSync(ProductSchema)({
  name: "Effect-TS 指南",
  price: 99.9,
  quantity: 100,
})
console.log("合法产品:", product)

// 验证负数被拒绝
try {
  Schema.decodeUnknownSync(ProductSchema)({ name: "测试", price: -1, quantity: 10 })
} catch (err) {
  console.log("负价格被拒绝:", (err as Error).message)
}

// ============================================================
// 6. decodeSync vs decodeUnknownSync
// ============================================================

console.log("\n=== 6. decodeSync vs decodeUnknownSync ===")

// decodeUnknownSync: 输入为 unknown，最常用的入口
const unknownInput: unknown = JSON.parse('{"name":"张三","age":28,"email":"z@e.com"}')
const result = Schema.decodeUnknownSync(UserSchema)(unknownInput)
console.log("decodeUnknownSync 结果:", result)

// ============================================================
// 7. 校验失败时的错误信息
// ============================================================

console.log("\n=== 7. 错误信息示例 ===")

const StrictUserSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isMinLength(2))),
  age: Schema.Number.pipe(Schema.check(Schema.isInt())),
})

try {
  Schema.decodeUnknownSync(StrictUserSchema)({
    name: "A",   // 太短
    age: 3.14,   // 不是整数
  })
} catch (err) {
  const error = err as any
  console.log("校验失败:")
  console.log("  错误类型:", error.constructor.name)
  if (error.errors) {
    for (const e of error.errors) {
      console.log("  -", e.path?.join("."), ":", e.message)
    }
  } else {
    console.log("  -", error.message)
  }
}

console.log("\n✅ 01-basic-struct.ts 运行完成")

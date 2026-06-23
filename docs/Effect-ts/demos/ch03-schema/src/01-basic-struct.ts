/**
 * 01-basic-struct.ts — Schema.Struct 基础
 *
 * 学习目标: 掌握 Schema.Struct 定义数据结构，理解基本类型、可选字段、
 *          数组/字典、数值约束，以及同步校验和错误信息
 * 前置章节: 第 2 章（Effect 类型入门）
 * 运行方式: bun run src/01-basic-struct.ts
 */

import { Schema } from "effect"

// ============================================================
// 1. Schema.Struct — 定义结构化数据
// ============================================================
// Schema.Struct 是 Schema 系统中最常用的构造器，用于定义对象结构。
// 每个字段的值是一个 Schema，定义该字段的类型和校验规则。

const UserSchema = Schema.Struct({
  name: Schema.String,       // 字符串字段
  age: Schema.Number,        // 数字字段
  email: Schema.String,      // 邮箱（后续可加格式校验）
})

// 从 Schema 提取 TypeScript 类型
type User = Schema.Schema.Type<typeof UserSchema>
// type User = { readonly name: string; readonly age: number; readonly email: string }

console.log("--- 1. Schema.Struct 基础 ---")
console.log("UserSchema 定义了一个包含 name/age/email 三个字段的结构")

// 校验合法数据
const validUser = Schema.decodeUnknownSync(UserSchema)({
  name: "Alice",
  age: 30,
  email: "alice@example.com",
})
console.log("合法数据校验通过:", validUser)

// 校验非法数据 — 缺少必填字段
try {
  Schema.decodeUnknownSync(UserSchema)({
    name: "Bob",
    // age 和 email 缺失
  })
} catch (err) {
  console.log("非法数据校验失败 (缺少必填字段):")
  console.log("  错误信息:", (err as Error).message)
}

// ============================================================
// 2. Schema.Literal — 字面量类型
// ============================================================
// Schema.Literal 约束值必须等于指定的字面量。常用于状态、角色等枚举值。

const StatusSchema = Schema.Literal("active", "inactive", "suspended")
type Status = Schema.Schema.Type<typeof StatusSchema>
// type Status = "active" | "inactive" | "suspended"

console.log("\n--- 2. Schema.Literal ---")
console.log("合法值:", Schema.decodeUnknownSync(StatusSchema)("active"))
try {
  Schema.decodeUnknownSync(StatusSchema)("deleted")
} catch (err) {
  console.log("非法值 'deleted' 被拒绝:", (err as Error).message)
}

// ============================================================
// 3. Schema.optional — 可选字段
// ============================================================
// Schema.optional 将字段标记为可选，对应 TypeScript 的 ? 标记。

const ProfileSchema = Schema.Struct({
  username: Schema.String,
  bio: Schema.optional(Schema.String),     // 可选字符串
  age: Schema.optional(Schema.Number),     // 可选数字
})

console.log("\n--- 3. Schema.optional ---")
// 提供所有字段
const fullProfile = Schema.decodeUnknownSync(ProfileSchema)({
  username: "alice42",
  bio: "TypeScript 爱好者",
  age: 28,
})
console.log("完整数据:", fullProfile)

// 省略可选字段
const minimalProfile = Schema.decodeUnknownSync(ProfileSchema)({
  username: "bob99",
})
console.log("最小数据 (省略可选字段):", minimalProfile)

// ============================================================
// 4. Schema.Array — 数组类型
// ============================================================
// Schema.Array 定义元素类型一致的数组。

const TagsSchema = Schema.Array(Schema.String)
const ScoresSchema = Schema.Array(Schema.Number)

console.log("\n--- 4. Schema.Array ---")
const tags = Schema.decodeUnknownSync(TagsSchema)(["typescript", "effect-ts", "schema"])
console.log("字符串数组:", tags)

const scores = Schema.decodeUnknownSync(ScoresSchema)([95, 87, 92])
console.log("数字数组:", scores)

// 数组元素类型不匹配
try {
  Schema.decodeUnknownSync(ScoresSchema)([95, "high", 92])
} catch (err) {
  console.log("数组元素类型错误:", (err as Error).message)
}

// ============================================================
// 5. Schema.Record — 字典/映射类型
// ============================================================
// Schema.Record(keySchema, valueSchema) 定义键值对集合。

const ConfigSchema = Schema.Record(Schema.String, Schema.String)
const CountMapSchema = Schema.Record(Schema.String, Schema.Number)

console.log("\n--- 5. Schema.Record ---")
const config = Schema.decodeUnknownSync(ConfigSchema)({
  host: "localhost",
  port: "8080",
  env: "production",
})
console.log("字符串字典:", config)

const counts = Schema.decodeUnknownSync(CountMapSchema)({
  apples: 5,
  oranges: 3,
})
console.log("数字字典:", counts)

// ============================================================
// 6. 数值约束 — Schema.check + Schema.isGreaterThan
// ============================================================
// Schema 不提供 Schema.positive() 这样的快捷方法。
// 正确方式: 使用 Schema.check() 配合内置的过滤器函数。

const PositiveNumberSchema = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThan(0))
)

const AgeSchema = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0))  // 年龄 >= 0
)

console.log("\n--- 6. 数值约束 ---")
console.log("正数 42:", Schema.decodeUnknownSync(PositiveNumberSchema)(42))
try {
  Schema.decodeUnknownSync(PositiveNumberSchema)(-5)
} catch (err) {
  console.log("负数 -5 被拒绝:", (err as Error).message)
}

console.log("年龄 25:", Schema.decodeUnknownSync(AgeSchema)(25))
try {
  Schema.decodeUnknownSync(AgeSchema)(-1)
} catch (err) {
  console.log("年龄 -1 被拒绝:", (err as Error).message)
}

// ============================================================
// 7. 组合使用 — 完整的用户模型
// ============================================================
// 将以上所有概念组合成一个完整的用户模型。

const FullUserSchema = Schema.Struct({
  id: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  name: Schema.String,
  email: Schema.String,
  status: Schema.Literal("active", "inactive", "suspended"),
  tags: Schema.Array(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})

type FullUser = Schema.Schema.Type<typeof FullUserSchema>

console.log("\n--- 7. 完整用户模型 ---")

const goodUser = Schema.decodeUnknownSync(FullUserSchema)({
  id: 1,
  name: "Alice",
  email: "alice@example.com",
  status: "active",
  tags: ["admin", "premium"],
  metadata: { department: "engineering", level: "senior" },
})
console.log("合法用户:", goodUser)

// 多项校验失败
try {
  Schema.decodeUnknownSync(FullUserSchema)({
    id: -1,                              // id 不满足 > 0
    name: "Bob",
    email: "bob@example.com",
    status: "deleted",                   // 不在 Literal 范围内
    tags: ["user", 123],                 // 数组元素类型错误
  })
} catch (err) {
  console.log("多项校验失败:")
  console.log("  错误信息:", (err as Error).message)
}

// ============================================================
// 8. 总结
// ============================================================
console.log("\n--- 8. 总结 ---")
console.log("┌──────────────────────┬─────────────────────────────────┐")
console.log("│ Schema 构造器        │ 用途                            │")
console.log("├──────────────────────┼─────────────────────────────────┤")
console.log("│ Schema.Struct        │ 定义对象结构（字段+类型）       │")
console.log("│ Schema.String        │ 字符串类型                      │")
console.log("│ Schema.Number        │ 数字类型                        │")
console.log("│ Schema.Boolean       │ 布尔类型                        │")
console.log("│ Schema.Literal       │ 字面量/枚举值                   │")
console.log("│ Schema.optional      │ 可选字段                        │")
console.log("│ Schema.Array         │ 数组类型                        │")
console.log("│ Schema.Record        │ 字典/映射类型                   │")
console.log("│ Schema.check         │ 附加校验约束                    │")
console.log("│ Schema.isGreaterThan │ 数值下限过滤器                  │")
console.log("└──────────────────────┴─────────────────────────────────┘")
console.log("\n关键理解:")
console.log("  - Schema 定义的是运行时校验规则，TypeScript 类型在编译后消失")
console.log("  - Schema.decodeUnknownSync 从 unknown 解码并校验")
console.log("  - Schema.decodeSync 从已知编码类型解码")
console.log("  - 校验失败时抛出 ParseError，包含详细的错误路径和原因")

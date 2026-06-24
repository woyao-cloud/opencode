/**
 * 03-extend-omit.ts — Schema 扩展与裁剪 (Extend / Omit / Pick / Partial)
 *
 * 演示如何通过 Struct 组合实现 Schema 的扩展、裁剪、部分类型等操作。
 * 注意: beta.65 中不提供 Schema.extend / Schema.omit 等内置 API，
 * 需要通过 Struct 手动组合实现。
 * 运行: bun run src/03-extend-omit.ts
 */

import { Schema } from "effect"
import * as S from "effect/Schema"

// ============================================================
// 1. Schema.extend — 扩展字段 (手动实现)
// ============================================================

console.log("=== 1. Schema.extend 扩展字段 ===")

// 基础 Schema
const BaseUser = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

// 扩展: 在 BaseUser 基础上添加字段
// 通过 Struct.fields 获取已有字段，再合并新字段
const ExtendedUser = Schema.Struct({
  ...BaseUser.fields,
  email: Schema.String,
  phone: Schema.optional(Schema.String),
})

const user1 = Schema.decodeUnknownSync(ExtendedUser)({
  name: "张三",
  age: 28,
  email: "zhangsan@example.com",
})
console.log("扩展用户:", user1)

// ============================================================
// 2. Schema.omit — 省略字段 (手动实现)
// ============================================================

console.log("\n=== 2. Schema.omit 省略字段 ===")

const FullUser = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
  password: Schema.String,
  createdAt: Schema.Date,
})

// 省略 password 和 createdAt 字段
// 通过解构排除不需要的字段
const { password: _, createdAt: __, ...restFields } = FullUser.fields
const PublicUser = Schema.Struct(restFields)

const publicUser = Schema.decodeUnknownSync(PublicUser)({
  name: "李四",
  age: 25,
  email: "lisi@example.com",
})
console.log("公开用户 (无敏感字段):", publicUser)

// 验证 password 字段被拒绝
try {
  Schema.decodeUnknownSync(PublicUser)({
    name: "王五",
    age: 30,
    email: "wangwu@example.com",
    password: "secret123",  // 多余字段
  })
  console.log("多余字段被忽略 (Struct 默认行为)")
} catch (err) {
  console.log("多余字段被拒绝:", (err as Error).message)
}

// ============================================================
// 3. Schema.pick — 选取字段 (手动实现)
// ============================================================

console.log("\n=== 3. Schema.pick 选取字段 ===")

// 从 FullUser 中只选取 name 和 email
const UserPreview = Schema.Struct({
  name: FullUser.fields.name,
  email: FullUser.fields.email,
})

const preview = Schema.decodeUnknownSync(UserPreview)({
  name: "赵六",
  email: "zhaoliu@example.com",
})
console.log("用户预览:", preview)

// ============================================================
// 4. Schema.partial — 全部可选 (手动实现)
// ============================================================

console.log("\n=== 4. Schema.partial 全部可选 ===")

// 将 BaseUser 的所有字段变为可选
const PartialUser = Schema.Struct({
  name: Schema.optional(Schema.String),
  age: Schema.optional(Schema.Number),
})

// 只提供部分字段
const partial1 = Schema.decodeUnknownSync(PartialUser)({ name: "Alice" })
console.log("仅 name:", partial1)

// 空对象
const partial2 = Schema.decodeUnknownSync(PartialUser)({})
console.log("空对象:", partial2)

// 完整对象
const partial3 = Schema.decodeUnknownSync(PartialUser)({
  name: "Bob",
  age: 30,
})
console.log("完整对象:", partial3)

// ============================================================
// 5. Schema.required — 全部必填 (手动实现)
// ============================================================

console.log("\n=== 5. Schema.required 全部必填 ===")

// 从可选字段 Schema 创建必填版本
const OptionalProfile = Schema.Struct({
  name: Schema.optional(Schema.String),
  bio: Schema.optional(Schema.String),
})

// 手动创建必填版本
const RequiredProfile = Schema.Struct({
  name: Schema.String,
  bio: Schema.String,
})

try {
  Schema.decodeUnknownSync(RequiredProfile)({ name: "Charlie" })
} catch (err) {
  console.log("缺少必填字段 bio 被拒绝:", (err as Error).message)
}

// ============================================================
// 6. 多层扩展 — 组合多个 Schema
// ============================================================

console.log("\n=== 6. 多层扩展 ===")

// 基础联系人
const Contact = Schema.Struct({
  email: Schema.String,
  phone: Schema.optional(Schema.String),
})

// 地址信息
const Address = Schema.Struct({
  city: Schema.String,
  street: Schema.String,
  zipCode: Schema.String,
})

// 组合: 用户 = 基础信息 + 联系人 + 地址
const CompleteUser = Schema.Struct({
  ...BaseUser.fields,
  ...Contact.fields,
  ...Address.fields,
})

const completeUser = Schema.decodeUnknownSync(CompleteUser)({
  name: "David",
  age: 35,
  email: "david@example.com",
  city: "北京",
  street: "长安街 1 号",
  zipCode: "100000",
})
console.log("完整用户:", JSON.stringify(completeUser, null, 2))

// ============================================================
// 7. 使用 extendTo (beta.65 实验性 API)
// ============================================================

console.log("\n=== 7. extendTo 实验性 API ===")

// extendTo 是 beta.65 中提供的扩展 API
// 它接受新字段和 derive 函数（用于从旧字段推导新字段的默认值）
try {
  const Base = Schema.Struct({ a: Schema.String, b: Schema.Number })
  const Extended = Base.pipe(
    S.extendTo({ c: Schema.Boolean })
  )
  const result = Schema.decodeUnknownSync(Extended)({
    a: "hello",
    b: 42,
    c: true,
  })
  console.log("extendTo 结果:", result)
} catch (err) {
  console.log("extendTo 需要 derive 参数:", (err as Error).message)
}

console.log("\n✅ 03-extend-omit.ts 运行完成")

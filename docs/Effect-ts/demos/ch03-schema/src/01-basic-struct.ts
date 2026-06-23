/**
 * 01-basic-struct.ts — Schema.Struct 基础
 *
 * 学习目标: 掌握 Schema.Struct 定义数据结构，理解 Schema 基本类型（String/Number/Boolean/Literal），
 *          使用 optional/Array/Record 构建复合类型，通过 decodeSync/decodeUnknownSync 进行运行时校验
 * 前置章节: 第 2 章（Effect 类型入门）
 * 运行方式: bun run src/01-basic-struct.ts
 */

import { Schema } from "effect"

// ============================================================
// 1. Schema.Struct — 定义对象结构
// ============================================================
// Schema.Struct 是 Schema 中最常用的构造器，用于定义具有固定字段的对象类型。
// 每个字段的值是一个 Schema 定义，指定该字段的类型和校验规则。

const UserSchema = Schema.Struct({
  name: Schema.String,       // 必须是 string
  age: Schema.Number,        // 必须是 number
  email: Schema.String,      // 必须是 string
})

// 从 Schema 推导 TypeScript 类型
type User = typeof UserSchema.Type
// 等价于: { readonly name: string; readonly age: number; readonly email: string }

console.log("--- 1. Schema.Struct 基础 ---")
console.log("UserSchema 定义了一个包含 name/age/email 三个字段的对象结构")

// decodeSync — 同步校验并返回类型安全的值
const validUser = Schema.decodeSync(UserSchema)({
  name: "张三",
  age: 28,
  email: "zhangsan@example.com",
})
console.log("校验通过:", validUser)

// decodeUnknownSync — 从 unknown 类型校验（更安全的入口）
const fromUnknown = Schema.decodeUnknownSync(UserSchema)({
  name: "李四",
  age: 35,
  email: "lisi@example.com",
})
console.log("从 unknown 校验通过:", fromUnknown)

// ============================================================
// 2. 校验失败 — 运行时类型安全保障
// ============================================================
// 当输入数据不符合 Schema 定义时，decodeSync 会抛出 ParseError。
// 这是 Schema 的核心价值：在运行时捕获类型不匹配，防止脏数据进入系统。

console.log("\n--- 2. 校验失败示例 ---")

try {
  Schema.decodeSync(UserSchema)({
    name: "王五",
    age: "不是数字",  // 应该是 number，但传入了 string
    email: "wangwu@example.com",
  })
} catch (error) {
  console.log("校验失败 (age 字段类型错误):")
  console.log("  错误类型:", (error as any).constructor?.name ?? typeof error)
  console.log("  错误信息:", (error as Error).message)
}

// 缺少必填字段也会失败
try {
  Schema.decodeSync(UserSchema)({
    name: "赵六",
    // age 和 email 缺失
  })
} catch (error) {
  console.log("\n校验失败 (缺少必填字段):")
  console.log("  错误信息:", (error as Error).message)
}

// ============================================================
// 3. Schema.optional — 可选字段
// ============================================================
// Schema.optional(Schema.String) 表示该字段可以存在（且为 string）或不存在。

const ProfileSchema = Schema.Struct({
  username: Schema.String,
  bio: Schema.optional(Schema.String),     // 可选 string
  website: Schema.optional(Schema.String), // 可选 string
})

type Profile = typeof ProfileSchema.Type

console.log("\n--- 3. Schema.optional 可选字段 ---")

// 提供所有字段
const fullProfile = Schema.decodeSync(ProfileSchema)({
  username: "developer42",
  bio: "全栈工程师",
  website: "https://dev42.dev",
})
console.log("完整 profile:", fullProfile)

// 省略可选字段
const minimalProfile = Schema.decodeSync(ProfileSchema)({
  username: "minimal_user",
})
console.log("最小 profile (省略可选字段):", minimalProfile)

// ============================================================
// 4. Schema.Literal — 字面量类型
// ============================================================
// Schema.Literal 限制字段只能取指定的字面量值。
// 常用于状态字段、枚举值、标签等。

const OrderSchema = Schema.Struct({
  id: Schema.Number,
  status: Schema.Literal("pending", "processing", "shipped", "delivered"),
  paymentMethod: Schema.Literal("credit_card", "alipay", "wechat_pay"),
})

type Order = typeof OrderSchema.Type
// status: "pending" | "processing" | "shipped" | "delivered"

console.log("\n--- 4. Schema.Literal 字面量类型 ---")

const validOrder = Schema.decodeSync(OrderSchema)({
  id: 1001,
  status: "processing",
  paymentMethod: "alipay",
})
console.log("有效订单:", validOrder)

// 非法状态值
try {
  Schema.decodeSync(OrderSchema)({
    id: 1002,
    status: "cancelled",  // 不在 Literal 允许的值中
    paymentMethod: "credit_card",
  })
} catch (error) {
  console.log("\n校验失败 (status 值不合法):")
  console.log("  错误信息:", (error as Error).message)
}

// ============================================================
// 5. Schema.Array — 数组类型
// ============================================================
// Schema.Array(Schema.Number) 表示元素为 number 的数组。

const TeamSchema = Schema.Struct({
  name: Schema.String,
  members: Schema.Array(Schema.String),  // string[]
  scores: Schema.Array(Schema.Number),   // number[]
})

type Team = typeof TeamSchema.Type

console.log("\n--- 5. Schema.Array 数组类型 ---")

const team = Schema.decodeSync(TeamSchema)({
  name: "前端团队",
  members: ["张三", "李四", "王五"],
  scores: [95, 88, 92],
})
console.log("团队数据:", team)

// 数组元素类型不匹配
try {
  Schema.decodeSync(TeamSchema)({
    name: "后端团队",
    members: ["赵六", 123],  // 123 不是 string
    scores: [80, 90],
  })
} catch (error) {
  console.log("\n校验失败 (数组元素类型错误):")
  console.log("  错误信息:", (error as Error).message)
}

// ============================================================
// 6. Schema.Record — 字典/映射类型
// ============================================================
// Schema.Record(keySchema, valueSchema) 表示键值对映射。
// 常用于动态 key 的对象，如配置项、标签集合等。

const ConfigSchema = Schema.Struct({
  appName: Schema.String,
  settings: Schema.Record(Schema.String, Schema.String),  // { [key: string]: string }
  featureFlags: Schema.Record(Schema.String, Schema.Boolean), // { [key: string]: boolean }
})

type Config = typeof ConfigSchema.Type

console.log("\n--- 6. Schema.Record 字典类型 ---")

const config = Schema.decodeSync(ConfigSchema)({
  appName: "MyApp",
  settings: {
    theme: "dark",
    language: "zh-CN",
    timezone: "Asia/Shanghai",
  },
  featureFlags: {
    newDashboard: true,
    betaSearch: false,
  },
})
console.log("配置数据:", config)

// ============================================================
// 7. 数值约束 — Schema.GreaterThan / Schema.check
// ============================================================
// Schema 提供数值约束来限制数字范围。
// 注意: Schema.positive() 在 Effect 4.0.0-beta.65 中不存在，
// 使用 Schema.GreaterThan(0) 或 Schema.check(Schema.isGreaterThan(0)) 代替。

const ProductSchema = Schema.Struct({
  name: Schema.String,
  price: Schema.compose(Schema.Number, Schema.GreaterThan(0)),  // 价格必须 > 0
  stock: Schema.compose(Schema.Number, Schema.between(0, 99999)), // 库存 0-99999
})

type Product = typeof ProductSchema.Type

console.log("\n--- 7. 数值约束 ---")

const validProduct = Schema.decodeSync(ProductSchema)({
  name: "机械键盘",
  price: 399,
  stock: 150,
})
console.log("有效商品:", validProduct)

// 价格 <= 0
try {
  Schema.decodeSync(ProductSchema)({
    name: "无效商品",
    price: 0,   // 不满足 GreaterThan(0)
    stock: 50,
  })
} catch (error) {
  console.log("\n校验失败 (price 不满足 GreaterThan(0)):")
  console.log("  错误信息:", (error as Error).message)
}

// 库存超出范围
try {
  Schema.decodeSync(ProductSchema)({
    name: "超量商品",
    price: 100,
    stock: 100000,  // 超出 between(0, 99999) 范围
  })
} catch (error) {
  console.log("\n校验失败 (stock 超出范围):")
  console.log("  错误信息:", (error as Error).message)
}

// ============================================================
// 8. 总结
// ============================================================
console.log("\n--- 8. 总结 ---")
console.log("┌──────────────────────────┬──────────────────────────────────────┐")
console.log("│ Schema API               │ 用途                                 │")
console.log("├──────────────────────────┼──────────────────────────────────────┤")
console.log("│ Schema.Struct            │ 定义固定字段的对象结构               │")
console.log("│ Schema.String            │ string 类型校验                      │")
console.log("│ Schema.Number            │ number 类型校验                      │")
console.log("│ Schema.Boolean           │ boolean 类型校验                     │")
console.log("│ Schema.Literal           │ 字面量联合类型                       │")
console.log("│ Schema.optional          │ 可选字段                             │")
console.log("│ Schema.Array             │ 数组类型                             │")
console.log("│ Schema.Record            │ 字典/映射类型                         │")
console.log("│ Schema.GreaterThan       │ 数值大于约束                         │")
console.log("│ Schema.between           │ 数值范围约束                         │")
console.log("│ Schema.decodeSync        │ 同步校验（已知类型）                 │")
console.log("│ Schema.decodeUnknownSync │ 同步校验（unknown 类型）             │")
console.log("└──────────────────────────┴──────────────────────────────────────┘")
console.log("\n关键理解:")
console.log("  - TypeScript 类型在编译后消失，Schema 在运行时提供类型安全保障")
console.log("  - decodeSync 适用于已知输入类型，decodeUnknownSync 适用于外部数据")
console.log("  - Schema.optional 让字段可选，未提供时值为 undefined")
console.log("  - 数值约束通过 Schema.compose 组合基础类型和约束条件")

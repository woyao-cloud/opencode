/**
 * 01-union-literal.ts — Union / Literal / TemplateLiteral
 *
 * 演示 Schema.Union、Schema.Literal、Schema.TemplateLiteral 的进阶用法，
 * 以及如何构建可区分的联合类型。
 * 运行: bun run src/01-union-literal.ts
 */

import { Schema } from "effect"
import * as S from "effect/Schema"

// ============================================================
// 1. Schema.Literal — 字面量联合
// ============================================================

console.log("=== 1. Schema.Literal 字面量联合 ===")

// Literal 可以定义精确的字面量值
// 注意: beta.65 中 Schema.Literal 只接受单个值
// 多值字面量使用 Schema.Literals (数组形式)
const ColorSchema = Schema.Literals(["red", "green", "blue"])
type Color = typeof ColorSchema.Type // "red" | "green" | "blue"

console.log("合法值 'red':", Schema.decodeUnknownSync(ColorSchema)("red"))
console.log("合法值 'blue':", Schema.decodeUnknownSync(ColorSchema)("blue"))

try {
  Schema.decodeUnknownSync(ColorSchema)("yellow")
} catch (err) {
  console.log("非法值 'yellow' 被拒绝:", (err as Error).message)
}

// ============================================================
// 2. Schema.Union — 联合类型
// ============================================================

console.log("\n=== 2. Schema.Union 联合类型 ===")

// Union 接受 Schema 数组，组合为联合类型
const StringOrNumber = Schema.Union([Schema.String, Schema.Number])

console.log("string 值:", Schema.decodeUnknownSync(StringOrNumber)("hello"))
console.log("number 值:", Schema.decodeUnknownSync(StringOrNumber)(42))

try {
  Schema.decodeUnknownSync(StringOrNumber)(true)
} catch (err) {
  console.log("boolean 值被拒绝:", (err as Error).message)
}

// ============================================================
// 3. 可区分联合 (Discriminated Union)
// ============================================================

console.log("\n=== 3. 可区分联合 (Discriminated Union) ===")

// 使用 TaggedStruct 创建带 _tag 的结构体
const Dog = Schema.TaggedStruct("Dog", {
  name: Schema.String,
  breed: Schema.String,
})

const Cat = Schema.TaggedStruct("Cat", {
  name: Schema.String,
  likesMice: Schema.Boolean,
})

// 组合为可区分联合
const Animal = Schema.Union([Dog, Cat]).pipe(Schema.toTaggedUnion("_tag"))
type Animal = typeof Animal.Type

// 运行时根据 _tag 自动识别具体类型
const dog = Schema.decodeUnknownSync(Animal)({
  _tag: "Dog",
  name: "旺财",
  breed: "金毛",
})
console.log("Dog 解码成功:", dog)

const cat = Schema.decodeUnknownSync(Animal)({
  _tag: "Cat",
  name: "咪咪",
  likesMice: true,
})
console.log("Cat 解码成功:", cat)

// ============================================================
// 4. Schema.TemplateLiteral — 模板字面量类型
// ============================================================

console.log("\n=== 4. Schema.TemplateLiteral 模板字面量 ===")

// TemplateLiteral 接受 Schema 数组，组合为模板字面量模式
// 注意: beta.65 中 TemplateLiteral 接受数组参数
const Greeting = Schema.TemplateLiteral([
  Schema.Literal("Hello, "),
  Schema.String,
  Schema.Literal("!"),
])

const validGreeting = Schema.decodeUnknownSync(Greeting)("Hello, World!")
console.log("合法模板:", validGreeting)

try {
  Schema.decodeUnknownSync(Greeting)("Hi, World!")
} catch (err) {
  console.log("非法模板被拒绝:", (err as Error).message)
}

// 更复杂的模板 — 路由路径模式
const RoutePath = Schema.TemplateLiteral([
  Schema.Literal("/api/"),
  Schema.String,
  Schema.Literal("/"),
  Schema.String,
])

const validRoute = Schema.decodeUnknownSync(RoutePath)("/api/users/123")
console.log("合法路由:", validRoute)

// ============================================================
// 5. Struct.fields — 从 Struct 提取字段名
// ============================================================

console.log("\n=== 5. Struct.fields 提取字段名 ===")

const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})

// Struct 的 fields 属性包含所有字段的 Schema
const fieldNames = Object.keys(UserSchema.fields)
console.log("字段名:", fieldNames)

// 可以用字段名构建字面量联合
const UserField = Schema.Literals(fieldNames as [string, ...string[]])
console.log("字段联合 'name':", Schema.decodeUnknownSync(UserField)("name"))
console.log("字段联合 'age':", Schema.decodeUnknownSync(UserField)("age"))

try {
  Schema.decodeUnknownSync(UserField)("invalidField")
} catch (err) {
  console.log("非法字段被拒绝:", (err as Error).message)
}

// ============================================================
// 6. 复杂可区分联合 — 多字段 tag
// ============================================================

console.log("\n=== 6. 复杂可区分联合 ===")

// 除了 _tag，还可以用其他字段做区分
const Success = Schema.TaggedStruct("Success", {
  data: Schema.String,
  code: Schema.Literal(200),
})

const NotFound = Schema.TaggedStruct("NotFound", {
  message: Schema.String,
  code: Schema.Literal(404),
})

const ApiResponse = Schema.Union([Success, NotFound]).pipe(
  Schema.toTaggedUnion("_tag")
)

const response1 = Schema.decodeUnknownSync(ApiResponse)({
  _tag: "Success",
  data: "用户数据",
  code: 200,
})
console.log("成功响应:", response1)

const response2 = Schema.decodeUnknownSync(ApiResponse)({
  _tag: "NotFound",
  message: "用户不存在",
  code: 404,
})
console.log("未找到响应:", response2)

console.log("\n✅ 01-union-literal.ts 运行完成")

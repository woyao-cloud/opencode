/**
 * 03-encode-decode.ts — 序列化与反序列化
 *
 * 演示 decodeUnknownSync/encodeUnknownSync（同步版本）、
 * decodeUnknownEffect/encodeUnknownEffect（Effect 版本）、
 * JSON 往返、以及自定义数据清洗。
 * 运行: bun run src/03-encode-decode.ts
 *
 * 注意: beta.65 中 Schema.decode/Schema.encode 需要带 transform 的 Schema，
 * 普通 Struct 使用 decodeUnknownSync/decodeUnknownEffect 系列 API。
 */

import { Schema, Effect, pipe, Option } from "effect"

// ============================================================
// 1. Schema 编解码基础
// ============================================================

console.log("=== 1. 编解码基础 ===")

const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})

type User = typeof UserSchema.Type

// decodeUnknownSync — 从 unknown 同步解码（最常用）
const user: User = Schema.decodeUnknownSync(UserSchema)({
  name: "张三",
  age: 28,
  email: "zhangsan@example.com",
})
console.log("decodeUnknownSync:", user)

// encodeUnknownSync — 将类型安全对象同步编码回原始格式
const encoded = Schema.encodeUnknownSync(UserSchema)(user)
console.log("encodeUnknownSync:", encoded)
console.log("往返一致:", JSON.stringify(user) === JSON.stringify(encoded))

// ============================================================
// 2. decodeUnknownEffect / encodeUnknownEffect — Effect 原生集成
// ============================================================

console.log("\n=== 2. Effect 原生集成的编解码 ===")

// decodeUnknownEffect — 直接返回 Effect，无缝集成 Effect 管道
const decodeProgram = pipe(
  Schema.decodeUnknownEffect(UserSchema)({
    name: "李四",
    age: 30,
    email: "lisi@example.com",
  }),
  Effect.map((u) => `用户: ${u.name}, ${u.age}岁`),
)

const decodeResult = Effect.runSync(decodeProgram)
console.log("decodeUnknownEffect:", decodeResult)

// encodeUnknownEffect — Effect 版本的编码
const encodeProgram = pipe(
  Schema.encodeUnknownEffect(UserSchema)({
    name: "王五",
    age: 22,
    email: "ww@example.com",
  }),
  Effect.map((enc) => JSON.stringify(enc)),
)

const encodeResult = Effect.runSync(encodeProgram)
console.log("encodeUnknownEffect:", encodeResult)

// ============================================================
// 3. JSON 序列化往返
// ============================================================

console.log("\n=== 3. JSON 序列化往返 ===")

// 完整往返流程：JSON 字符串 → decode → 类型安全对象 → encode → JSON 字符串
const jsonString = '{"name":"孙七","age":40,"email":"sq@example.com"}'
console.log("输入 JSON:", jsonString)

const roundTrip = pipe(
  // 步骤 1: JSON 解析
  Effect.sync(() => JSON.parse(jsonString)),
  // 步骤 2: Schema 校验并解码
  Effect.flatMap((parsed: unknown) =>
    Schema.decodeUnknownEffect(UserSchema)(parsed)
  ),
  // 步骤 3: 在类型安全的环境下操作数据
  Effect.map((validUser) => ({
    ...validUser,
    name: validUser.name.toUpperCase(), // 安全：编译器知道 name 是 string
    age: validUser.age + 1,
  })),
  // 步骤 4: 编码回普通对象
  Effect.flatMap((modified) =>
    Schema.encodeUnknownEffect(UserSchema)(modified)
  ),
  // 步骤 5: 序列化为 JSON
  Effect.map((obj) => JSON.stringify(obj)),
)

const outputJson = Effect.runSync(roundTrip)
console.log("输出 JSON:", outputJson)

// ============================================================
// 4. Schema.decodeUnknownOption — 不抛异常的校验
// ============================================================

console.log("\n=== 4. 不抛异常的校验 ===")

// decodeUnknownOption 返回 Option，合法数据 → Some，非法数据 → None
const result1 = Schema.decodeUnknownOption(UserSchema)({
  name: "测试",
  age: 20,
  email: "test@test.com",
})
console.log("合法数据:", result1)

const result2 = Schema.decodeUnknownOption(UserSchema)({
  name: "测试",
  // 缺少 age 和 email
})
console.log("非法数据:", result2)

if (Option.isSome(result1)) {
  console.log("  Some 值:", result1.value.name)
}
if (Option.isNone(result2)) {
  console.log("  None — 数据校验失败但不抛异常")
}

// ============================================================
// 5. 自定义数据清洗
// ============================================================

console.log("\n=== 5. 自定义数据清洗 ===")

// 场景：API 返回的字符串数据需要清洗（trim、小写化等）
function cleanInput(raw: unknown): unknown {
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>
    return {
      ...obj,
      name: typeof obj.name === "string" ? obj.name.trim() : obj.name,
      email: typeof obj.email === "string"
        ? obj.email.toLowerCase().trim()
        : obj.email,
    }
  }
  return raw
}

// 清洗流程：先清洗，再校验
const dirtyData = {
  name: "  张三  ",
  age: 28,
  email: "  ZhangSan@Example.COM  ",
}

const cleaned = cleanInput(dirtyData)
const normalized = Schema.decodeUnknownSync(UserSchema)(cleaned)
console.log("清洗前:", dirtyData)
console.log("清洗后:", normalized)

// ============================================================
// 6. encodeUnknownSync — 带变换的编码
// ============================================================

console.log("\n=== 6. encodeUnknownSync ===")

// encodeUnknownSync 接收 unknown 输入，先解码再编码
const rawInput = { name: "编码测试", age: 25, email: "encode@test.com" }
const encoded2 = Schema.encodeUnknownSync(UserSchema)(rawInput)
console.log("encodeUnknownSync:", encoded2)

console.log("\n✅ 03-encode-decode.ts 运行完成")

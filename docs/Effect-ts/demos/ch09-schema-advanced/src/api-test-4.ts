/**
 * api-test-4.ts — 验证 suspend/declare/TemplateLiteralParser 的具体用法
 */
import { Schema } from "effect"
import * as S from "effect/Schema"

// 1. Schema.suspend — 递归 Schema 的替代 API
console.log("=== Schema.suspend ===")
console.log("suspend 签名:", S.suspend.toString().substring(0, 400))

// 测试 suspend 用法
try {
  interface TreeNode {
    value: number
    children: TreeNode[]
  }
  const TreeNodeSchema: Schema.Schema<any, any> = S.Struct({
    value: S.Number,
    children: S.Array(S.suspend(() => TreeNodeSchema))
  })
  const node = Schema.decodeUnknownSync(TreeNodeSchema)({
    value: 1,
    children: [{ value: 2, children: [] }]
  })
  console.log("suspend 递归 — OK:", JSON.stringify(node))
} catch (e: any) {
  console.log("suspend 递归 — ERROR:", e.message)
}

// 2. Schema.declare — 自定义 Schema 构造
console.log("\n=== Schema.declare ===")
console.log("declare 签名:", S.declare.toString().substring(0, 400))

// 测试 declare 用法
try {
  // declare 用于创建自定义类型的 Schema
  const MySchema = S.declare(
    (input: unknown) => typeof input === "string" && input.length > 0,
    { description: "NonEmptyString" }
  )
  console.log("declare 自定义 Schema — OK, type:", typeof MySchema)
} catch (e: any) {
  console.log("declare 自定义 Schema — ERROR:", e.message)
}

// 3. TemplateLiteralParser
console.log("\n=== TemplateLiteralParser ===")
console.log("TemplateLiteralParser 签名:", S.TemplateLiteralParser.toString().substring(0, 400))

// 4. extendTo — 检查
console.log("\n=== extendTo ===")
console.log("extendTo 签名:", S.extendTo.toString().substring(0, 400))

// 5. tagDefaultOmit — 检查
console.log("\n=== tagDefaultOmit ===")
console.log("tagDefaultOmit 签名:", S.tagDefaultOmit.toString().substring(0, 400))

// 6. toIso / toCodecIso — 检查变换相关
console.log("\n=== toIso / toCodecIso ===")
console.log("toIso 签名:", S.toIso.toString().substring(0, 300))
console.log("toCodecIso 签名:", S.toCodecIso.toString().substring(0, 300))

// 7. 尝试用 pipe + filter 实现变换效果
console.log("\n=== pipe + filter 测试 ===")
try {
  const EvenNumber = S.Number.pipe(
    S.makeFilter((n: number) => n % 2 === 0)
  )
  console.log("makeFilter — OK, type:", typeof EvenNumber)
  const r1 = Schema.decodeUnknownSync(EvenNumber)(2)
  console.log("  decode 2:", r1)
  try {
    Schema.decodeUnknownSync(EvenNumber)(3)
  } catch (e: any) {
    console.log("  decode 3 failed:", e.message?.substring(0, 100))
  }
} catch (e: any) {
  console.log("makeFilter — ERROR:", e.message)
}

// 8. 尝试用 Struct + Spread 实现 extend 效果
console.log("\n=== Struct + 手动 extend ===")
const Base = S.Struct({ a: S.String, b: S.Number })
// 扩展字段
const Extended = S.Struct({
  a: S.String,
  b: S.Number,
  c: S.Boolean
})
console.log("手动 extend — OK")

// 9. 尝试用 Struct + Omit 效果（手动）
const Omitted = S.Struct({
  a: S.String
  // b 被省略
})
console.log("手动 omit — OK")

// 10. 检查 fromJsonString 等（可能的编解码变换）
console.log("\n=== fromJsonString ===")
console.log("fromJsonString 签名:", S.fromJsonString.toString().substring(0, 300))

// 11. TemplateLiteral 完整用法
console.log("\n=== TemplateLiteral 完整测试 ===")
try {
  const Greeting = S.TemplateLiteral([
    S.Literal("Hello, "),
    S.String,
    S.Literal("!")
  ])
  console.log("TemplateLiteral — OK, type:", typeof Greeting)
  const decoded = Schema.decodeUnknownSync(Greeting)("Hello, World!")
  console.log("  decode 'Hello, World!':", decoded)
  try {
    Schema.decodeUnknownSync(Greeting)("Hi, World!")
  } catch (e: any) {
    console.log("  decode 'Hi, World!' failed:", e.message?.substring(0, 100))
  }
} catch (e: any) {
  console.log("TemplateLiteral — ERROR:", e.message)
}

// 12. Schema.NumberFromString 等已有变换（作为 transform 的替代方案）
console.log("\n=== 内建变换 Schema ===")
const nfs = Schema.decodeUnknownSync(Schema.NumberFromString)("42")
console.log("NumberFromString:", nfs, typeof nfs)

console.log("\n✅ API 验证 4 完成")

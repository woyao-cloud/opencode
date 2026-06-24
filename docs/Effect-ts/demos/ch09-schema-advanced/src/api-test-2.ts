/**
 * api-test-2.ts — 深入验证 beta.65 中 Schema 进阶 API 的实际路径
 */
import { Schema, ParseResult } from "effect"
import * as S from "effect/Schema"

// 1. 检查 S 命名空间 (effect/Schema)
const sKeys = Object.keys(S)
console.log("effect/Schema 所有 key:", sKeys.filter(k => !k.startsWith("_")).sort())

// 2. 检查 S.transform 等
console.log("\nS.transform 类型:", typeof (S as any).transform)
console.log("S.transformResult 类型:", typeof (S as any).transformResult)
console.log("S.transformLiteral 类型:", typeof (S as any).transformLiteral)
console.log("S.extend 类型:", typeof (S as any).extend)
console.log("S.omit 类型:", typeof (S as any).omit)
console.log("S.Lazy 类型:", typeof (S as any).Lazy)
console.log("S.compose 类型:", typeof (S as any).compose)
console.log("S.TemplateLiteral 类型:", typeof (S as any).TemplateLiteral)

// 3. transform 相关的所有 key
const transKeys = sKeys.filter(k => k.toLowerCase().includes("transform"))
console.log("\nS 中包含 'transform' 的 key:", transKeys)

// 4. 尝试 TemplateLiteral 的实际用法
console.log("\n=== TemplateLiteral 测试 ===")
try {
  // 尝试 variadic 调用
  const tl1 = (S as any).TemplateLiteral(Schema.Literal("Hello, "), Schema.String)
  console.log("TemplateLiteral(...spread) — OK, type:", typeof tl1)
} catch (e: any) {
  console.log("TemplateLiteral(...spread) — ERROR:", e.message)
}

// 5. 尝试 transform 的实际用法
console.log("\n=== transform 测试 ===")
try {
  const StrToNum = (S as any).transform(
    Schema.String,
    Schema.Number,
    { decode: (s: string) => parseInt(s, 10), encode: (n: number) => n.toString() }
  )
  console.log("S.transform(from, to, {decode, encode}) — OK, type:", typeof StrToNum)
} catch (e: any) {
  console.log("S.transform ERROR:", e.message)
}

// 6. 尝试 extend
console.log("\n=== extend 测试 ===")
const Base = Schema.Struct({ a: Schema.String, b: Schema.Number })
try {
  if (typeof (S as any).extend === "function") {
    const ext = (S as any).extend(Base, { c: Schema.Boolean })
    console.log("S.extend(schema, fields) — OK, type:", typeof ext)
  }
} catch (e: any) {
  console.log("S.extend ERROR:", e.message)
}

// 7. 尝试 omit
console.log("\n=== omit 测试 ===")
try {
  if (typeof (S as any).omit === "function") {
    const om = (S as any).omit(Base, "b")
    console.log("S.omit(schema, key) — OK, type:", typeof om)
  }
} catch (e: any) {
  console.log("S.omit ERROR:", e.message)
}

// 8. 尝试 Lazy
console.log("\n=== Lazy 测试 ===")
try {
  if (typeof (S as any).Lazy === "function") {
    const lazySchema = (S as any).Lazy(() => Schema.String)
    console.log("S.Lazy(() => Schema.String) — OK, type:", typeof lazySchema)
  }
} catch (e: any) {
  console.log("S.Lazy ERROR:", e.message)
}

// 9. 查看 Schema.Struct 的 pipe 可用方法
console.log("\n=== Struct pipe 方法 ===")
const baseProto = Object.getPrototypeOf(Base)
const baseProtoKeys = Object.getOwnPropertyNames(baseProto)
console.log("Struct prototype keys:", baseProtoKeys.filter(k => !k.startsWith("_")))

// 10. 查看 Schema.String 的 pipe 可用方法
console.log("\n=== String pipe 方法 ===")
const StrProto = Object.getPrototypeOf(Schema.String)
const strProtoKeys = Object.getOwnPropertyNames(StrProto)
console.log("String prototype keys:", strProtoKeys.filter(k => !k.startsWith("_")))

console.log("\n✅ API 验证 2 完成")

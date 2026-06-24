/**
 * api-test.ts — 验证 ch09 所需 API 是否在 beta.65 中可用
 */
import { Schema } from "effect"

// 1. Schema.Union — 验证数组形式
const UnionTest = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal("a"), value: Schema.String }),
  Schema.Struct({ _tag: Schema.Literal("b"), count: Schema.Number }),
])
console.log("1. Schema.Union (数组形式) — OK, type:", typeof UnionTest.ast)

// 2. Schema.Literal — 验证
const LitTest = Schema.Literal("x", "y", "z")
console.log("2. Schema.Literal — OK, type:", typeof LitTest.ast)

// 3. Schema.TemplateLiteral — 验证
try {
  const TL = (Schema as any).TemplateLiteral
  console.log("3. Schema.TemplateLiteral — exists:", typeof TL)
} catch (e) {
  console.log("3. Schema.TemplateLiteral — NOT FOUND")
}

// 4. Schema.transform / Schema.transformOrFail — 验证
try {
  const tf = (Schema as any).transform
  console.log("4. Schema.transform — exists:", typeof tf)
} catch (e) {
  console.log("4. Schema.transform — NOT FOUND")
}

try {
  const tfo = (Schema as any).transformOrFail
  console.log("5. Schema.transformOrFail — exists:", typeof tfo)
} catch (e) {
  console.log("5. Schema.transformOrFail — NOT FOUND")
}

// 6. Schema.extend / Schema.omit — 验证
try {
  const ext = (Schema as any).extend
  console.log("6. Schema.extend — exists:", typeof ext)
} catch (e) {
  console.log("6. Schema.extend — NOT FOUND")
}

try {
  const om = (Schema as any).omit
  console.log("7. Schema.omit — exists:", typeof om)
} catch (e) {
  console.log("7. Schema.omit — NOT FOUND")
}

// 8. Schema.Lazy — 验证
try {
  const lz = (Schema as any).Lazy
  console.log("8. Schema.Lazy — exists:", typeof lz)
} catch (e) {
  console.log("8. Schema.Lazy — NOT FOUND")
}

// 9. 检查 Struct.fields 是否有 extend/omit
const Base = Schema.Struct({ a: Schema.String, b: Schema.Number })
try {
  const ext = (Base as any).extend
  console.log("9. Struct.pipe(Schema.extend(...)) — exists:", typeof ext)
} catch (e) {
  console.log("9. Struct.pipe(Schema.extend(...)) — NOT FOUND")
}

// 10. 检查 Struct 上的 pipe 链式 extend/omit
try {
  const extended = (Base as any).pipe?.((Schema as any).extend?.({ c: Schema.Boolean }))
  console.log("10. Struct.pipe(Schema.extend({...})) — returned:", typeof extended)
} catch (e: any) {
  console.log("10. Struct.pipe(Schema.extend({...})) — ERROR:", e.message)
}

// 11. 检查 transform 在 pipe 中的用法
try {
  const tfSchema = Schema.String.pipe?.((Schema as any).transform?.(
    (s: string) => parseInt(s),
    (n: number) => n.toString()
  ))
  console.log("11. String.pipe(Schema.transform(...)) — returned:", typeof tfSchema)
} catch (e: any) {
  console.log("11. String.pipe(Schema.transform(...)) — ERROR:", e.message)
}

// 12. 检查 TemplateLiteral 用法
try {
  if (typeof (Schema as any).TemplateLiteral === "function") {
    const tl = (Schema as any).TemplateLiteral(Schema.Literal("Hello, "), Schema.String)
    console.log("12. Schema.TemplateLiteral(...) — returned:", typeof tl)
  }
} catch (e: any) {
  console.log("12. Schema.TemplateLiteral(...) — ERROR:", e.message)
}

// 13. 检查 Lazy 用法
try {
  if (typeof (Schema as any).Lazy === "function") {
    const lazySchema = (Schema as any).Lazy(() => Schema.String)
    console.log("13. Schema.Lazy(() => Schema.String) — returned:", typeof lazySchema)
  }
} catch (e: any) {
  console.log("13. Schema.Lazy(...) — ERROR:", e.message)
}

// 14. 检查 Schema.compose
try {
  const comp = (Schema as any).compose
  console.log("14. Schema.compose — exists:", typeof comp)
} catch (e) {
  console.log("14. Schema.compose — NOT FOUND")
}

// 15. 检查 Schema.TemplateLiteral 的完整签名
try {
  const tl = (Schema as any).TemplateLiteral
  console.log("15. TemplateLiteral 签名:", tl?.toString()?.substring(0, 200))
} catch (e: any) {
  console.log("15. TemplateLiteral 签名 — ERROR:", e.message)
}

console.log("\n✅ API 验证完成")

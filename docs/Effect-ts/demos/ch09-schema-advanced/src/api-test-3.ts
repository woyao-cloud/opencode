/**
 * api-test-3.ts — 搜索 transform/extend/omit/Lazy 的实际 API 名称
 */
import { Schema } from "effect"
import * as S from "effect/Schema"

// 获取 effect/Schema 的全部导出
const allSKeys = Object.keys(S).filter(k => !k.startsWith("_")).sort()

// 搜索包含 "ransform" 的
console.log("=== 包含 'ransform' 的 key ===")
allSKeys.filter(k => /ransform/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "ompose" 的
console.log("\n=== 包含 'ompose' 的 key ===")
allSKeys.filter(k => /ompose/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "xtend" 的
console.log("\n=== 包含 'xtend' 的 key ===")
allSKeys.filter(k => /xtend/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "omit" 的
console.log("\n=== 包含 'omit' 的 key ===")
allSKeys.filter(k => /mit/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "azy" 的
console.log("\n=== 包含 'azy' 的 key ===")
allSKeys.filter(k => /azy/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "suspend" 的（可能是 Lazy 的替代名）
console.log("\n=== 包含 'suspend' 的 key ===")
allSKeys.filter(k => /suspend/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "declare" 的（可能是 Lazy 的替代名）
console.log("\n=== 包含 'declare' 的 key ===")
allSKeys.filter(k => /declare/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "partial" 的
console.log("\n=== 包含 'partial' 的 key ===")
allSKeys.filter(k => /partial/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "pick" 的
console.log("\n=== 包含 'pick' 的 key ===")
allSKeys.filter(k => /pick/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "attach" 的
console.log("\n=== 包含 'attach' 的 key ===")
allSKeys.filter(k => /attach/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "filter" 的
console.log("\n=== 包含 'filter' 的 key ===")
allSKeys.filter(k => /filter/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "encoded" 的
console.log("\n=== 包含 'encoded' 的 key ===")
allSKeys.filter(k => /encoded/i.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索包含 "type" 的 (可能 typeSchema 之类的)
console.log("\n=== 包含 'Type' 的 key ===")
allSKeys.filter(k => k.includes("Type")).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 搜索 TemplateLiteralParser
console.log("\n=== TemplateLiteralParser ===")
console.log(`  TemplateLiteralParser: ${typeof S.TemplateLiteralParser}`)

// 尝试用 TemplateLiteral 的各种调用方式
console.log("\n=== TemplateLiteral 调用方式测试 ===")
const TL = S.TemplateLiteral as any
console.log("TL.length:", TL.length) // 参数数量

// 尝试数组参数
try {
  const tl2 = TL([Schema.Literal("Hello, "), Schema.String])
  console.log("TL([...]) — OK, type:", typeof tl2)
} catch (e: any) {
  console.log("TL([...]) — ERROR:", e.message)
}

// 检查 TemplateLiteral 的源码
console.log("TL.toString:", TL.toString().substring(0, 500))

// 检查 Struct 的 prototype 上有什么方法可用于扩展
console.log("\n=== Struct 可用的 pipe 操作 ===")
// 查看是否有 Schema 模块级的函数可以操作 Struct
const structRelated = allSKeys.filter(k => {
  const v = (S as any)[k]
  return typeof v === "function" && /struct|record|object/i.test(k)
})
console.log("struct/record/object 相关:", structRelated)

// 检查 to/from 相关
console.log("\n=== to/from 相关 ===")
allSKeys.filter(k => /^(to|from)/.test(k)).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

// 检查 is* 相关（之前有 isGreaterThan 等）
console.log("\n=== is* 相关 (部分) ===")
allSKeys.filter(k => /^is[A-Z]/.test(k)).slice(0, 10).forEach(k => console.log(`  ${k}: ${typeof (S as any)[k]}`))

console.log("\n✅ API 验证 3 完成")

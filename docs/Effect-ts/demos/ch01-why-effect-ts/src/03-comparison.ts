/**
 * 03-comparison.ts — Effect-TS 与其他方案对比
 *
 * 学习目标: 理解 Effect-TS 的一体化优势 vs 组合多个库的方案
 * 前置章节: 02-first-effect.ts
 * 运行方式: bun run src/03-comparison.ts
 *
 * 场景: 读取配置 → 调用 API → 校验响应 → 存入数据库
 * 对比: 纯 TS / zod+手工DI / Effect-TS
 */

import { Effect, Schema, Context } from "effect"

// ===== 方案 A: 纯 TypeScript (仅展示结构) =====
// 问题: 错误类型丢失、依赖手工管理、校验与类型分离

// ===== 方案 B: zod + 手工 DI (仅展示结构) =====
// 问题: 校验和类型需要维护两份、DI 无标准方案

// ===== 方案 C: Effect-TS 一体化 =====

// Schema 同时提供类型和校验
const Config = Schema.Struct({
  apiUrl: Schema.String,
  timeout: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
})
type Config = typeof Config.Type // 类型自动推导

// Context + Layer 提供标准化 DI
class ApiService extends Context.Service<ApiService>()("ApiService", {
  fetch: (): Effect.Effect<never, Error, string> => Effect.succeed(""),
}) {}

// 完整流程: 类型安全、错误可追踪、依赖可替换
const program = Effect.gen(function* () {
  const api = yield* ApiService
  const result = yield* api.fetch()
  return result
})

console.log("方案对比代码结构展示完成")
console.log("Effect-TS 优势: 类型+校验统一、DI 标准化、错误类型化")

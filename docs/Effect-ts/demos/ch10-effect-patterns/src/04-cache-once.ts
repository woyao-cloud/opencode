/**
 * 04-cache-once.ts — 缓存与一次性操作
 *
 * 演示 Effect-TS 的缓存和一次性执行模式：
 * - Effect.cached — 缓存 Effect 结果（永久缓存）
 * - Effect.cachedWithTTL — 带过期时间的缓存
 * - 使用 Ref 实现"只执行一次"语义
 * - 手动缓存函数模式
 *
 * 注意: Effect.cached 返回 Effect<Effect<A>>（嵌套 Effect），
 * 需要先运行外层 Effect 获取内层 Effect，然后多次运行内层 Effect。
 *
 * 运行: bun run src/04-cache-once.ts
 */

import { Effect, Duration, Ref } from "effect"

// ============================================================
// 1. Effect.cached — 永久缓存
// ============================================================

console.log("=== 1. Effect.cached — 永久缓存 ===\n")

let computeCount1 = 0

const expensiveCompute1 = Effect.gen(function* () {
  computeCount1++
  console.log(`  实际计算执行（第 ${computeCount1} 次）`)
  return `计算结果 #${computeCount1}`
})

// cached: 返回 Effect<Effect<A>>，外层创建缓存，内层是实际计算
// 先运行外层获取内层 Effect，然后多次运行内层
const cachedOuter1 = expensiveCompute1.pipe(Effect.cached)

Effect.runPromise(cachedOuter1).then((cachedInner1) => {
  // 第一次调用内层: 执行实际计算
  return Effect.runPromise(cachedInner1).then((result) => {
    console.log("第 1 次调用:", result)
    // 第二次调用内层: 返回缓存结果
    return Effect.runPromise(cachedInner1)
  }).then((result) => {
    console.log("第 2 次调用:", result)
    // 第三次调用内层: 仍然返回缓存结果
    return Effect.runPromise(cachedInner1)
  }).then((result) => {
    console.log("第 3 次调用:", result)
    console.log(`实际计算次数: ${computeCount1}（应该为 1）`)
  })
})

// ============================================================
// 2. Effect.cachedWithTTL — 带过期时间的缓存
// ============================================================

console.log("\n=== 2. Effect.cachedWithTTL — 带过期时间的缓存 ===\n")

let computeCount2 = 0

const expensiveCompute2 = Effect.gen(function* () {
  computeCount2++
  console.log(`  实际计算执行（第 ${computeCount2} 次）`)
  return `计算结果 #${computeCount2}`
})

// cachedWithTTL: 同样返回 Effect<Effect<A>>，需要先获取内层 Effect
const cachedOuter2 = expensiveCompute2.pipe(
  Effect.cachedWithTTL(Duration.seconds(60)),
)

Effect.runPromise(cachedOuter2).then((cachedInner2) => {
  // 前两次调用应该在 TTL 内，返回缓存
  return Effect.runPromise(cachedInner2).then((result) => {
    console.log("第 1 次调用:", result)
    return Effect.runPromise(cachedInner2)
  }).then((result) => {
    console.log("第 2 次调用（应在缓存内）:", result)
    console.log(`实际计算次数: ${computeCount2}（应该为 1）`)
  })
})

// ============================================================
// 3. 使用 Ref 实现"只执行一次"语义
// ============================================================

console.log("\n=== 3. 使用 Ref 实现只执行一次 ===\n")

let initCount = 0

// 在 Effect 外部创建 Ref，确保只创建一次
const initRef = Effect.runSync(Ref.make(false))

const doInit = Effect.gen(function* () {
  initCount++
  console.log(`  初始化执行（第 ${initCount} 次）`)
  return `初始化完成 #${initCount}`
})

// 使用 Ref 确保只执行一次
const safeInit = Ref.getAndSet(initRef, true).pipe(
  Effect.flatMap((already) => {
    if (already) {
      return Effect.succeed("已初始化（跳过）")
    }
    return doInit
  }),
)

// 多次调用，但实际只执行一次
Effect.runPromise(safeInit).then((result) => {
  console.log("第 1 次初始化:", result)
  return Effect.runPromise(safeInit)
}).then((result) => {
  console.log("第 2 次初始化:", result)
  return Effect.runPromise(safeInit)
}).then((result) => {
  console.log("第 3 次初始化:", result)
  console.log(`实际初始化次数: ${initCount}（应该为 1）`)
})

// ============================================================
// 4. 手动缓存函数模式
// ============================================================

console.log("\n=== 4. 手动缓存函数模式 ===\n")

// 使用 Map 实现手动缓存
const cache = new Map<string, string>()

const fetchData = (key: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    // 检查缓存
    const cached = cache.get(key)
    if (cached !== undefined) {
      console.log(`  缓存命中: ${key}`)
      return cached
    }

    // 模拟耗时计算
    console.log(`  实际计算: ${key}`)
    const result = `数据[${key}] = ${key.toUpperCase()}`
    cache.set(key, result)
    return result
  })

// 多次调用相同 key
Effect.runPromise(fetchData("user")).then((result) => {
  console.log("第 1 次 user:", result)
  return Effect.runPromise(fetchData("user"))
}).then((result) => {
  console.log("第 2 次 user:", result)
  return Effect.runPromise(fetchData("config"))
}).then((result) => {
  console.log("第 1 次 config:", result)
  return Effect.runPromise(fetchData("config"))
}).then((result) => {
  console.log("第 2 次 config:", result)
  console.log("缓存大小:", cache.size)
})

// ============================================================
// 5. 实用模式: 带缓存的配置加载
// ============================================================

console.log("\n=== 5. 实用模式: 带缓存的配置加载 ===\n")

let loadCount = 0

const loadConfig = Effect.gen(function* () {
  loadCount++
  console.log(`  加载配置（第 ${loadCount} 次）`)
  return {
    apiUrl: "https://api.example.com",
    timeout: 5000,
    retries: 3,
  }
})

// 使用 cached 确保配置只加载一次
const configOuter = loadConfig.pipe(Effect.cached)

Effect.runPromise(configOuter).then((configInner) => {
  // 多次获取配置
  return Effect.runPromise(configInner).then((config) => {
    console.log("第 1 次获取配置:", config)
    return Effect.runPromise(configInner)
  }).then((config) => {
    console.log("第 2 次获取配置:", config)
    console.log(`实际加载次数: ${loadCount}（应该为 1）`)
  })
})

console.log("\n✅ 04-cache-once.ts 运行完成")

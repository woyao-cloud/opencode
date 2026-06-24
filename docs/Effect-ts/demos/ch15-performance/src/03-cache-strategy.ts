/**
 * 03-cache-strategy.ts — Cache 策略：cached vs cachedWithTTL、命中率对比
 *
 * 性能分析要点：
 * - Cache 避免重复计算：相同输入只执行一次 Effect
 * - cached: 永久缓存，无过期时间
 * - cachedWithTTL: 带 TTL 的缓存，过期后重新计算
 * - 适合：数据库查询、API 调用、CPU 密集计算
 * - 注意：缓存 key 的选择影响命中率
 *
 * 运行: bun run src/03-cache-strategy.ts
 */
import { Effect, Cache, Duration, Console, Array as Arr } from "effect"

// ============================================================
// 1. 模拟昂贵计算
// ============================================================

// 计数计算次数，用于对比缓存效果
let computeCount = 0

const expensiveComputation = (input: number): Effect.Effect<number> =>
  Effect.gen(function* () {
    computeCount++
    // 模拟计算耗时
    yield* Effect.sleep("10 millis")
    return input * input
  })

// ============================================================
// 2. 无缓存基线 — 每次计算
// ============================================================

const demoNoCache = Effect.gen(function* () {
  Console.log("=== 1. 无缓存基线 ===")
  computeCount = 0

  const start = performance.now()

  // 5 次调用，3 次重复（参数 2、3 各调两次）
  const inputs = [1, 2, 3, 2, 3]
  for (const input of inputs) {
    const result = yield* expensiveComputation(input)
  }

  const elapsed = (performance.now() - start).toFixed(3)
  Console.log(`  调用 5 次（3 个唯一值）: ${elapsed}ms，计算次数: ${computeCount}`)
  Console.log(`  预期: 5 次计算（无缓存，每次都重新算）`)
})

// ============================================================
// 3. cached — 永久缓存
// ============================================================

const demoCached = Effect.gen(function* () {
  Console.log("\n=== 2. cached — 永久缓存 ===")
  computeCount = 0

  // 创建缓存版本的函数
  const cachedCompute = yield* Cache.cached(expensiveComputation)

  const start = performance.now()

  // 5 次调用，3 次重复
  const inputs = [1, 2, 3, 2, 3]
  for (const input of inputs) {
    const result = yield* cachedCompute(input)
  }

  const elapsed = (performance.now() - start).toFixed(3)
  Console.log(`  调用 5 次（3 个唯一值）: ${elapsed}ms，计算次数: ${computeCount}`)
  Console.log(`  预期: 3 次计算（重复调用命中缓存）`)
})

// ============================================================
// 4. cachedWithTTL — 带过期时间的缓存
// ============================================================

const demoCachedWithTTL = Effect.gen(function* () {
  Console.log("\n=== 3. cachedWithTTL — 带 TTL 缓存 ===")
  computeCount = 0

  // TTL 50ms，容量 100
  const cache = yield* Cache.make({
    capacity: 100,
    timeToLive: Duration.millis(50),
    lookup: expensiveComputation,
  })

  const start = performance.now()

  // 第一次调用
  const r1 = yield* cache.get(1)
  Console.log(`  第一次 get(1): ${r1}，计算次数: ${computeCount}`)

  // 立即再调 — 命中缓存
  const r2 = yield* cache.get(1)
  Console.log(`  立即再 get(1): ${r2}，计算次数: ${computeCount}（命中缓存）`)

  // 等待 TTL 过期
  yield* Effect.sleep("60 millis")

  // TTL 过期后重新计算
  const r3 = yield* cache.get(1)
  Console.log(`  TTL 过期后 get(1): ${r3}，计算次数: ${computeCount}（重新计算）`)

  const elapsed = (performance.now() - start).toFixed(3)
  Console.log(`  总耗时: ${elapsed}ms`)
})

// ============================================================
// 5. 命中率对比 — 不同缓存策略
// ============================================================

const demoHitRate = Effect.gen(function* () {
  Console.log("\n=== 4. 命中率对比 — 不同访问模式 ===")

  // 模拟访问模式: 80% 的请求集中在 20% 的数据上（Zipf 分布）
  const hotKeys = [1, 2, 3]
  const coldKeys = Arr.range(4, 20)
  const allKeys = [...hotKeys, ...coldKeys]

  // 生成 100 次访问：80% 概率访问热 key
  const generateAccessPattern = (count: number): Array<number> => {
    const result: Array<number> = []
    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.8) {
        result.push(hotKeys[Math.floor(Math.random() * hotKeys.length)])
      } else {
        result.push(coldKeys[Math.floor(Math.random() * coldKeys.length)])
      }
    }
    return result
  }

  const accessPattern = generateAccessPattern(100)
  computeCount = 0

  const cache = yield* Cache.make({
    capacity: 50,
    timeToLive: Duration.seconds(60),
    lookup: expensiveComputation,
  })

  const start = performance.now()
  for (const key of accessPattern) {
    yield* cache.get(key)
  }
  const elapsed = (performance.now() - start).toFixed(3)

  // 计算命中率（唯一 key 数 vs 总访问数）
  const uniqueKeys = new Set(accessPattern).size
  Console.log(`  总访问: ${accessPattern.length} 次`)
  Console.log(`  唯一 key 数: ${uniqueKeys}`)
  Console.log(`  实际计算次数: ${computeCount}`)
  Console.log(`  缓存命中: ${accessPattern.length - computeCount} 次`)
  Console.log(`  命中率: ${(((accessPattern.length - computeCount) / accessPattern.length) * 100).toFixed(1)}%`)
  Console.log(`  耗时: ${elapsed}ms`)
})

// ============================================================
// 6. 缓存容量驱逐
// ============================================================

const demoCapacityEviction = Effect.gen(function* () {
  Console.log("\n=== 5. 缓存容量驱逐 — LRU 策略 ===")
  computeCount = 0

  // 小容量缓存（只存 3 个）
  const cache = yield* Cache.make({
    capacity: 3,
    timeToLive: Duration.seconds(60),
    lookup: expensiveComputation,
  })

  // 添加 5 个不同的 key
  const keys = [1, 2, 3, 4, 5]
  for (const key of keys) {
    yield* cache.get(key)
  }

  // 此时容量为 3，key 1, 2 已被驱逐（LRU）
  Console.log(`  添加 5 个 key（容量 3）后计算次数: ${computeCount}`)

  // 重新访问 key 1 — 已驱逐，需重新计算
  const beforeRecompute = computeCount
  yield* cache.get(1)
  Console.log(`  重新访问 key 1（已驱逐）: ${computeCount > beforeRecompute ? "重新计算" : "命中缓存"}`)

  // 重新访问 key 5 — 仍在缓存中
  const beforeHit = computeCount
  yield* cache.get(5)
  Console.log(`  重新访问 key 5（仍在缓存）: ${computeCount > beforeHit ? "重新计算" : "命中缓存"}`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoNoCache
  yield* demoCached
  yield* demoCachedWithTTL
  yield* demoHitRate
  yield* demoCapacityEviction
  Console.log("\n✅ 03-cache-strategy.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

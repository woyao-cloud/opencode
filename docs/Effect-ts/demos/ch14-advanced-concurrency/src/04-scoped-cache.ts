/**
 * 04-scoped-cache.ts — ScopedCache：带作用域的异步缓存
 *
 * ScopedCache 是一个绑定到 Scope 的缓存，使用 lookup 函数
 * 自动获取未缓存的值。支持 TTL 过期、容量限制、手动
 * invalidate/refresh。Scope 关闭时所有缓存条目被清理。
 *
 * 核心操作：make / get / set / refresh / invalidate / size / keys
 *
 * 运行: bun run src/04-scoped-cache.ts
 */
import { Effect, ScopedCache, Console, Duration } from "effect"

// ============================================================
// 1. make + get — 基础缓存用法
// ============================================================

const demoBasic = Effect.gen(function* () {
  Console.log("=== 1. make / get — 基础缓存 ===")

  let callCount = 0

  // ScopedCache.make(options) — 创建缓存
  const cache = yield* ScopedCache.make<number, string>({
    // lookup 函数在缓存未命中时调用
    lookup: (key: number) =>
      Effect.gen(function* () {
        callCount++
        yield* Console.log(`  [lookup] 查询 key=${key}（第 ${callCount} 次调用）`)
        return `value-for-${key}`
      }),
    capacity: 100,
  })

  // 第一次 get — 触发 lookup
  const v1 = yield* ScopedCache.get(cache, 1)
  Console.log(`  第一次 get(1): ${v1}`)

  // 第二次 get — 命中缓存，不触发 lookup
  const v2 = yield* ScopedCache.get(cache, 1)
  Console.log(`  第二次 get(1): ${v2}（命中缓存）`)

  // 不同 key
  const v3 = yield* ScopedCache.get(cache, 42)
  Console.log(`  get(42): ${v3}`)

  Console.log(`  lookup 总调用次数: ${callCount}（预期 2 次）`)
})

// ============================================================
// 2. set + has — 手动设置和检查
// ============================================================

const demoSet = Effect.gen(function* () {
  Console.log("\n=== 2. set / has — 手动管理缓存 ===")

  const cache = yield* ScopedCache.make<number, string>({
    lookup: (key) => Effect.succeed(`lookup-${key}`),
    capacity: 50,
  })

  // set — 手动设置值，跳过 lookup
  yield* ScopedCache.set(cache, 1, "手动设置的值")

  // has — 检查 key 是否存在
  const exists = yield* ScopedCache.has(cache, 1)
  Console.log(`  has(1): ${exists}`)

  const missing = yield* ScopedCache.has(cache, 999)
  Console.log(`  has(999): ${missing}`)

  const val = yield* ScopedCache.get(cache, 1)
  Console.log(`  get(1): ${val}（手动设置的值，未触发 lookup）`)
})

// ============================================================
// 3. refresh — 强制刷新
// ============================================================

const demoRefresh = Effect.gen(function* () {
  Console.log("\n=== 3. refresh — 强制刷新 ===")

  let counter = 0

  const cache = yield* ScopedCache.make<number, string>({
    lookup: (key) =>
      Effect.gen(function* () {
        counter++
        return `v${counter}-key${key}`
      }),
    capacity: 50,
  })

  // 初始获取
  const v1 = yield* ScopedCache.get(cache, 1)
  Console.log(`  初始 get(1): ${v1}`)

  // refresh — 强制重新调用 lookup
  const v2 = yield* ScopedCache.refresh(cache, 1)
  Console.log(`  refresh(1): ${v2}（重新查询，counter=${counter}）`)

  // 再次获取 — 使用刷新后的值
  const v3 = yield* ScopedCache.get(cache, 1)
  Console.log(`  再次 get(1): ${v3}`)
})

// ============================================================
// 4. invalidate / invalidateAll — 失效处理
// ============================================================

const demoInvalidate = Effect.gen(function* () {
  Console.log("\n=== 4. invalidate / invalidateAll — 失效处理 ===")

  let callCount = 0

  const cache = yield* ScopedCache.make<number, string>({
    lookup: (key) =>
      Effect.gen(function* () {
        callCount++
        return `lookup-${key}-call${callCount}`
      }),
    capacity: 100,
  })

  // 填充缓存
  yield* ScopedCache.get(cache, 1)
  yield* ScopedCache.get(cache, 2)
  yield* ScopedCache.get(cache, 3)

  const size1 = yield* ScopedCache.size(cache)
  Console.log(`  初始大小: ${size1}`)

  // invalidate — 使单个 key 失效
  yield* ScopedCache.invalidate(cache, 2)
  const size2 = yield* ScopedCache.size(cache)
  Console.log(`  invalidate(2) 后大小: ${size2}`)

  // 再次获取 — 触发 lookup
  const v = yield* ScopedCache.get(cache, 2)
  Console.log(`  重新 get(2): ${v}`)

  // invalidateAll — 使所有缓存失效
  yield* ScopedCache.invalidateAll(cache)
  const size3 = yield* ScopedCache.size(cache)
  Console.log(`  invalidateAll 后大小: ${size3}`)
})

// ============================================================
// 5. TTL — 时间过期
// ============================================================

const demoTTL = Effect.gen(function* () {
  Console.log("\n=== 5. TTL — 时间过期 ===")

  let callCount = 0

  const cache = yield* ScopedCache.make<number, string>({
    lookup: (key) =>
      Effect.gen(function* () {
        callCount++
        return `ttl-value-${key}-call${callCount}`
      }),
    capacity: 100,
    // TTL: 200ms 后缓存过期
    timeToLive: "200 millis",
  })

  // 初始获取
  const v1 = yield* ScopedCache.get(cache, 1)
  Console.log(`  初始 get(1): ${v1} (callCount=${callCount})`)

  // 立即再获取 — 命中缓存
  const v2 = yield* ScopedCache.get(cache, 1)
  Console.log(`  立即 get(1): ${v2} (callCount=${callCount}, 命中缓存)`)

  // 等待 TTL 过期
  yield* Effect.sleep("250 millis")

  // 过期后再获取 — 触发 lookup
  const v3 = yield* ScopedCache.get(cache, 1)
  Console.log(`  过期后 get(1): ${v3} (callCount=${callCount}, 重新查询)`)
})

// ============================================================
// 6. keys / values / entries — 遍历缓存
// ============================================================

const demoIterate = Effect.gen(function* () {
  Console.log("\n=== 6. keys / values / entries — 遍历 ===")

  const cache = yield* ScopedCache.make<number, string>({
    lookup: (key) => Effect.succeed(`item-${key}`),
    capacity: 100,
  })

  // 填充几个值
  yield* ScopedCache.get(cache, 10)
  yield* ScopedCache.get(cache, 20)
  yield* ScopedCache.get(cache, 30)

  const keys = yield* ScopedCache.keys(cache)
  Console.log(`  keys: [${keys}]`)

  const values = yield* ScopedCache.values(cache)
  Console.log(`  values: [${values}]`)

  const entries = yield* ScopedCache.entries(cache)
  Console.log(`  entries: [${entries.map(([k, v]) => `${k}->${v}`)}]`)
})

// ============================================================
// 7. 实战: API 响应缓存
// ============================================================

const demoAPICache = Effect.gen(function* () {
  Console.log("\n=== 7. 实战: API 响应缓存 ===")

  // 模拟 API 调用计数器
  const apiCalls: Record<string, number> = {}

  const cache = yield* ScopedCache.make<string, string>({
    lookup: (url: string) =>
      Effect.gen(function* () {
        apiCalls[url] = (apiCalls[url] || 0) + 1
        yield* Effect.sleep("50 millis") // 模拟网络延迟
        return `Response from ${url} (call #${apiCalls[url]})`
      }),
    capacity: 1000,
    timeToLive: "500 millis",
  })

  // 第一次请求 — 触发 API 调用
  const r1 = yield* ScopedCache.get(cache, "/api/users")
  Console.log(`  ${r1}`)

  // 第二次请求 — 命中缓存
  const r2 = yield* ScopedCache.get(cache, "/api/users")
  Console.log(`  ${r2}`)

  // 主动刷新
  const r3 = yield* ScopedCache.refresh(cache, "/api/users")
  Console.log(`  refresh: ${r3}`)

  // 失效后重新获取
  yield* ScopedCache.invalidate(cache, "/api/users")
  const r4 = yield* ScopedCache.get(cache, "/api/users")
  Console.log(`  invalidate 后: ${r4}`)

  Console.log(`  总 API 调用次数: ${apiCalls["/api/users"]}`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* Effect.scoped(Effect.gen(function* () {
    yield* demoBasic
    yield* demoSet
    yield* demoRefresh
    yield* demoInvalidate
    yield* demoTTL
    yield* demoIterate
    yield* demoAPICache
  }))
  Console.log("\n✅ 04-scoped-cache.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

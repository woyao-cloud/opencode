/**
 * 03-graceful-degradation.ts — 优雅降级
 *
 * 演示 Effect-TS 的优雅降级模式：
 * - Effect.allSuccesses — 忽略失败，只取成功结果
 * - Effect.partition — 分离成功和失败
 * - Effect.orElseSucceed — 失败时返回默认值
 * - 降级链 — 多级降级策略
 *
 * 运行: bun run src/03-graceful-degradation.ts
 */

import { Effect, Console, Duration } from "effect"

// ============================================================
// 1. Effect.allSuccesses — 忽略失败，只取成功结果
// ============================================================

console.log("=== 1. Effect.allSuccesses — 忽略失败，只取成功结果 ===\n")

// 模拟从多个微服务获取数据
interface ServiceResult {
  readonly service: string
  readonly data: string
}

const fetchFromService = (name: string, shouldFail: boolean): Effect.Effect<ServiceResult, Error> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(100))
    if (shouldFail) {
      return yield* Effect.fail(new Error(`${name} 服务不可用`))
    }
    return { service: name, data: `${name} 数据` }
  })

const services = [
  fetchFromService("用户服务", false),
  fetchFromService("订单服务", true),  // 这个会失败
  fetchFromService("商品服务", false),
  fetchFromService("支付服务", true),  // 这个会失败
  fetchFromService("通知服务", false),
]

// 使用 Effect.all 的 mode: "result" 获取所有结果（成功和失败）
const program1 = Effect.all(services, { concurrency: "unbounded", mode: "result" })

Effect.runPromise(program1).then((results) => {
  console.log("所有服务调用结果:")
  const successes = results.filter((r) => r._tag === "Success")
  const failures = results.filter((r) => r._tag === "Failure")
  successes.forEach((r) => {
    const val = (r as any).success as ServiceResult
    console.log(`  ✅ ${val.service}: ${val.data}`)
  })
  console.log(`\n失败的服务数: ${failures.length}`)
})

// ============================================================
// 2. Effect.partition — 分离成功和失败
// ============================================================

console.log("\n=== 2. Effect.partition — 分离成功和失败 ===\n")

// 批量处理用户数据，部分可能失败
interface UserData {
  readonly id: number
  readonly name: string
}

const users = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
  { id: 4, name: "Diana" },
  { id: 5, name: "Eve" },
]

const processUser = (user: UserData): Effect.Effect<string, string> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(50))
    // 模拟：id 为奇数的用户处理成功，偶数的失败
    if (user.id % 2 === 0) {
      return yield* Effect.fail(`用户 ${user.name} 数据不完整`)
    }
    return `已处理: ${user.name} (ID: ${user.id})`
  })

// partition: 将结果分为 [成功数组, 失败数组]
const program2 = Effect.partition(users, processUser, { concurrency: "unbounded" })

Effect.runPromise(program2).then(([failures, successes]) => {
  console.log("成功的处理:")
  successes.forEach((s) => console.log(`  ✅ ${s}`))
  console.log("\n失败的处理:")
  failures.forEach((f) => console.log(`  ❌ ${f}`))
})

// ============================================================
// 3. Effect.orElseSucceed — 失败时返回默认值
// ============================================================

console.log("\n=== 3. Effect.orElseSucceed — 失败时返回默认值 ===\n")

// 模拟从缓存获取数据，失败时使用默认值
const fetchFromCache = (key: string): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(50))
    if (key === "user:1") {
      return "缓存中的用户数据"
    }
    return yield* Effect.fail(new Error(`缓存未命中: ${key}`))
  })

// orElseSucceed: 失败时返回一个默认值
const program3a = fetchFromCache("user:1").pipe(
  Effect.orElseSucceed(() => "默认用户数据"),
)

const program3b = fetchFromCache("user:999").pipe(
  Effect.orElseSucceed(() => "默认用户数据"),
)

Effect.runPromise(program3a).then((result) =>
  console.log("缓存命中:", result),
)

Effect.runPromise(program3b).then((result) =>
  console.log("缓存未命中（使用默认值）:", result),
)

// ============================================================
// 4. 降级链 — 多级降级策略
// ============================================================

console.log("\n=== 4. 降级链 — 多级降级策略 ===\n")

// 定义降级级别
enum DegradationLevel {
  Full = "完整服务",
  Reduced = "降级服务",
  Basic = "基础服务",
  Fallback = "兜底服务",
}

// 模拟一个多层降级的服务调用
class ServiceUnavailable extends Error {
  readonly _tag = "ServiceUnavailable"
  constructor(readonly level: string) {
    super(`${level} 不可用`)
  }
}

// 第一级: 主服务
const primaryService = Effect.gen(function* () {
  yield* Console.log("  [主服务] 尝试调用...")
  yield* Effect.sleep(Duration.millis(100))
  return yield* Effect.fail(new ServiceUnavailable("主服务"))
})

// 第二级: 备用服务
const secondaryService = Effect.gen(function* () {
  yield* Console.log("  [备用服务] 尝试调用...")
  yield* Effect.sleep(Duration.millis(100))
  return yield* Effect.fail(new ServiceUnavailable("备用服务"))
})

// 第三级: 本地缓存
const localCache = Effect.gen(function* () {
  yield* Console.log("  [本地缓存] 尝试读取...")
  yield* Effect.sleep(Duration.millis(50))
  return "缓存数据（可能过期）"
})

// 第四级: 静态默认值
const staticDefault = Effect.succeed("静态默认配置")

// 构建降级链: 主服务 → 备用服务 → 本地缓存 → 静态默认值
const degradationChain = primaryService.pipe(
  Effect.catch(() => {
    console.log("  ⚠ 主服务失败，降级到备用服务")
    return secondaryService
  }),
  Effect.catch(() => {
    console.log("  ⚠ 备用服务失败，降级到本地缓存")
    return localCache
  }),
  Effect.catch(() => {
    console.log("  ⚠ 本地缓存失败，使用静态默认值")
    return staticDefault
  }),
)

const program4 = Effect.gen(function* () {
  const result = yield* degradationChain
  yield* Console.log(`\n最终结果: ${result}`)
})

Effect.runPromise(program4)

// ============================================================
// 5. 实用模式: 带超时的降级链
// ============================================================

console.log("\n=== 5. 实用模式: 带超时的降级链 ===\n")

// 每个服务都有超时限制
const serviceWithTimeout = (name: string, delay: number, fail: boolean): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    yield* Console.log(`  [${name}] 尝试调用...`)
    yield* Effect.sleep(Duration.millis(delay))
    if (fail) {
      return yield* Effect.fail(new Error(`${name} 返回错误`))
    }
    return `${name} 结果`
  }).pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(150),
      orElse: () => Effect.fail(new Error(`${name} 超时`)),
    }),
  )

const program5 = serviceWithTimeout("主服务", 200, true).pipe(
  Effect.catch((err) => {
    console.log(`  ⚠ ${err.message}，降级到备用服务`)
    return serviceWithTimeout("备用服务", 100, false)
  }),
  Effect.catch((err) => {
    console.log(`  ⚠ ${err.message}，使用兜底数据`)
    return Effect.succeed("兜底数据")
  }),
)

Effect.runPromise(program5).then((result) =>
  console.log(`\n降级链最终结果: ${result}`),
)

console.log("\n✅ 03-graceful-degradation.ts 运行完成")

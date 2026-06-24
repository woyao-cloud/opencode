/**
 * 05-layer-lifecycle.ts — Layer 生命周期与内存占用
 *
 * 内存管理要点：
 * - Layer 在第一次使用时初始化，在 Scope 关闭时销毁
 * - Layer.scoped 支持资源的 acquire/release 生命周期
 * - Layer.fresh 每次提供时创建新实例（隔离内存）
 * - Layer 实例可以被复用（默认行为），减少内存分配
 * - 合理使用 Layer.fresh 和默认复用模式控制内存
 *
 * 运行: bun run src/05-layer-lifecycle.ts
 */
import { Effect, Console, Layer, Scope, Context, Exit, Duration } from "effect"

// ============================================================
// 工具：追踪 Layer 实例创建/销毁
// ============================================================

let instanceCounter = 0
let destroyCounter = 0

interface Service {
  readonly id: number
  readonly name: string
}

// ============================================================
// 1. Layer 的基本生命周期 — 创建和销毁
// ============================================================

/**
 * Layer.scoped 支持在 Scope 关闭时执行清理逻辑。
 * 类似于 acquireRelease，但集成在 Layer 系统中。
 */
const makeServiceLayer = (name: string) =>
  Layer.scoped(
    Service,
    Effect.gen(function* () {
      const id = ++instanceCounter
      Console.log(`  [Layer.init] 创建服务 "${name}" (id=${id})`)

      // 注册清理 finalizer
      yield* Effect.addFinalizer((_exit) =>
        Effect.sync(() => {
          destroyCounter++
          Console.log(`  [Layer.destroy] 销毁服务 "${name}" (id=${id})`)
        }),
      )

      return { id, name }
    }),
  )

const demoLayerBasicLifecycle = Effect.gen(function* () {
  Console.log("=== 1. Layer 基本生命周期 ===")
  instanceCounter = 0
  destroyCounter = 0

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 提供 Layer — 此时初始化服务
      const svc = yield* Effect.serviceOption(Service)
      Console.log(`  Scope 内: service=${svc._tag === "Some" ? svc.value.name : "无"}`)
    }),
  ).pipe(
    // 提供 Layer 到 Scope 内
    Effect.provide(makeServiceLayer("DemoService")),
    Effect.scoped,
  )

  Console.log(`  统计: 创建=${instanceCounter}, 销毁=${destroyCounter}`)
  Console.log("  说明: Layer.scoped 管理服务的创建和销毁生命周期")
})

// ============================================================
// 2. Layer.fresh vs 默认复用 — 内存影响
// ============================================================

/**
 * 默认情况下，同一个 Layer 实例会被复用（单例模式）。
 * Layer.fresh 确保每次使用时创建新实例。
 */
class CounterService extends Context.Tag("CounterService")<
  CounterService,
  { readonly count: () => number }
>() {}

const makeCounterLayer = () =>
  Layer.scoped(
    CounterService,
    Effect.gen(function* () {
      let value = 0
      const id = ++instanceCounter
      Console.log(`  [init] CounterService #${id} 创建`)
      yield* Effect.addFinalizer((_exit) =>
        Effect.sync(() => {
          destroyCounter++
          Console.log(`  [destroy] CounterService #${id} 销毁`)
        }),
      )
      return { count: () => ++value }
    }),
  )

const demoLayerFresh = Effect.gen(function* () {
  Console.log("\n=== 2. Layer.fresh vs 默认复用 ===")
  instanceCounter = 0
  destroyCounter = 0

  // 默认行为：复用同一个 Layer 实例
  const sharedLayer = makeCounterLayer()

  yield* Effect.scoped(
    Effect.gen(function* () {
      // 第一次使用
      const svc1 = yield* CounterService
      Console.log(`  使用 1: count=${svc1.count()}`)

      // 第二次使用 — 同一个实例
      const svc2 = yield* CounterService
      Console.log(`  使用 2: count=${svc2.count()}（同一实例，count 递增）`)
    }),
  ).pipe(
    Effect.provide(sharedLayer),
    Effect.scoped,
  )

  Console.log(`  默认复用: 创建=${instanceCounter}, 销毁=${destroyCounter}`)

  // Layer.fresh：每次提供时创建新实例
  instanceCounter = 0
  destroyCounter = 0

  const freshLayer = Layer.fresh(makeCounterLayer())

  yield* Effect.scoped(
    Effect.gen(function* () {
      const svc1 = yield* CounterService
      Console.log(`  Fresh 使用 1: count=${svc1.count()}`)

      const svc2 = yield* CounterService
      Console.log(`  Fresh 使用 2: count=${svc2.count()}（新实例，count 重置）`)
    }),
  ).pipe(
    Effect.provide(freshLayer),
    Effect.scoped,
  )

  Console.log(`  Layer.fresh: 创建=${instanceCounter}, 销毁=${destroyCounter}`)
  Console.log("  说明: 默认复用减少内存分配；Layer.fresh 适合需要隔离的场景")
})

// ============================================================
// 3. Layer 组合的内存影响
// ============================================================

/**
 * Layer.merge 组合多个 Layer，它们共享同一个 Scope。
 * 关闭 Scope 时所有 Layer 的资源按 LIFO 顺序释放。
 */
interface DbService {
  readonly query: (sql: string) => Effect.Effect<string>
}
const DbService = Context.Tag<DbService>()

interface CacheService {
  readonly get: (key: string) => Effect.Effect<string | undefined>
}
const CacheService = Context.Tag<CacheService>()

const dbLayer = Layer.scoped(
  DbService,
  Effect.gen(function* () {
    Console.log("  [init] DatabaseService")
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("  [destroy] DatabaseService")),
    )
    return {
      query: (sql: string) => Effect.succeed(`result:${sql}`),
    }
  }),
)

const cacheLayer = Layer.scoped(
  CacheService,
  Effect.gen(function* () {
    const store = new Map<string, string>()
    Console.log("  [init] CacheService")
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("  [destroy] CacheService")),
    )
    return {
      get: (key: string) => Effect.sync(() => store.get(key)),
    }
  }),
)

const demoLayerComposition = Effect.gen(function* () {
  Console.log("\n=== 3. Layer 组合的内存影响 ===")

  const combinedLayer = Layer.merge(dbLayer, cacheLayer)

  yield* Effect.scoped(
    Effect.gen(function* () {
      const db = yield* DbService
      const cache = yield* CacheService

      const result = yield* db.query("SELECT 1")
      Console.log(`  DB 查询: ${result}`)
    }),
  ).pipe(
    Effect.provide(combinedLayer),
    Effect.scoped,
  )

  Console.log("  说明: Layer.merge 组合的多个 Layer 共享 Scope，统一释放")
})

// ============================================================
// 4. Layer.wrap — 包装现有值（无创建/销毁开销）
// ============================================================

/**
 * Layer.succeed 和 Layer.sync 包装已有对象，没有 acquire/release 生命周期。
 * 适合包装已经在其他地方管理的单例对象。
 */
const demoLayerSucceed = Effect.gen(function* () {
  Console.log("\n=== 4. Layer.succeed — 零开销包装 ===")

  // 使用 Layer.succeed 包装已有的简单对象
  const configLayer = Layer.succeed(
    Context.Tag<{ readonly timeout: number }>(),
    { timeout: 5000 },
  )

  yield* Effect.gen(function* () {
    const config = yield* Context.Tag<{ readonly timeout: number }>()
    Console.log(`  配置: timeout=${config.timeout}`)
  }).pipe(
    Effect.provide(configLayer),
  )

  Console.log("  说明: Layer.succeed 包装已有值，无创建/销毁开销")
})

// ============================================================
// 5. Layer 内存占用对比总结
// ============================================================

const demoMemoryComparison = Effect.gen(function* () {
  Console.log("\n=== 5. Layer 内存模式对比 ===")

  Console.log("  Layer.succeed:      最小（仅引用已有对象）")
  Console.log("  Layer.sync:         小（每次调用函数创建）")
  Console.log("  Layer.scoped:       中等（包含 acquire/release 生命周期）")
  Console.log("  Layer.fresh:        较大（每次请求创建新实例）")
  Console.log("  Layer.merge N 层:   中等（N 个 Layer 共享 Scope）")

  Console.log("\n  使用建议:")
  Console.log("  - 无状态配置 → Layer.succeed")
  Console.log("  - 需要初始化/销毁 → Layer.scoped")
  Console.log("  - 需要多实例隔离 → Layer.fresh")
  Console.log("  - 默认复用单例以减少内存")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoLayerBasicLifecycle
  yield* demoLayerFresh
  yield* demoLayerComposition
  yield* demoLayerSucceed
  yield* demoMemoryComparison
  Console.log("\n✅ 05-layer-lifecycle.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

/**
 * 01-overhead-analysis.ts — Effect 创建开销分析：flatMap vs gen vs all vs sequential
 *
 * 性能分析要点：
 * - Effect.succeed/sync 创建开销极小（几微秒）
 * - flatMap 链 vs Effect.gen：gen 有 generator 开销但可读性更好
 * - Effect.all（并发）vs 顺序 yield*：I/O 密集场景 all 更快
 * - 避免不必要的 Effect 包装：纯计算用 sync 而非 tryPromise
 *
 * 运行: bun run src/01-overhead-analysis.ts
 */
import { Effect, Console } from "effect"

// ============================================================
// 工具函数：测量 Effect 执行时间
// ============================================================

const measure = (label: string, effect: Effect.Effect<unknown>) =>
  Effect.gen(function* () {
    const start = performance.now()
    const result = yield* effect
    const elapsed = (performance.now() - start).toFixed(3)
    Console.log(`  ${label}: ${elapsed}ms`)
    return result
  })

// ============================================================
// 1. Effect 创建开销 — succeed vs sync vs fail
// ============================================================

const demoCreationOverhead = Effect.gen(function* () {
  Console.log("=== 1. Effect 创建开销（创建 100,000 个 Effect，不执行）===")

  // succeed — 纯值包装
  const start1 = performance.now()
  for (let i = 0; i < 100_000; i++) {
    Effect.succeed(i)
  }
  Console.log(`  Effect.succeed × 100,000: ${(performance.now() - start1).toFixed(3)}ms`)

  // sync — 函数包装
  const start2 = performance.now()
  for (let i = 0; i < 100_000; i++) {
    Effect.sync(() => i)
  }
  Console.log(`  Effect.sync × 100,000:    ${(performance.now() - start2).toFixed(3)}ms`)

  // fail — 错误包装
  const start3 = performance.now()
  for (let i = 0; i < 100_000; i++) {
    Effect.fail(new Error(`err-${i}`))
  }
  Console.log(`  Effect.fail × 100,000:    ${(performance.now() - start3).toFixed(3)}ms`)
})

// ============================================================
// 2. flatMap 链 vs Effect.gen — 执行开销对比
// ============================================================

const simpleTask = (n: number) => Effect.sync(() => n + 1)

const demoFlatMapVsGen = Effect.gen(function* () {
  Console.log("\n=== 2. flatMap 链 vs Effect.gen（10,000 次执行）===")

  // flatMap 链式 — 10 层嵌套
  const chain10 = (init: number) =>
    Effect.succeed(init).pipe(
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
      Effect.flatMap(simpleTask),
    )

  const start1 = performance.now()
  for (let i = 0; i < 10_000; i++) {
    yield* chain10(i)
  }
  Console.log(`  flatMap 链 (10层) × 10,000: ${(performance.now() - start1).toFixed(3)}ms`)

  // Effect.gen — 等效逻辑
  const gen10 = (init: number) =>
    Effect.gen(function* () {
      let n = init
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      n = yield* simpleTask(n)
      return n
    })

  const start2 = performance.now()
  for (let i = 0; i < 10_000; i++) {
    yield* gen10(i)
  }
  Console.log(`  Effect.gen (10层)   × 10,000: ${(performance.now() - start2).toFixed(3)}ms`)
})

// ============================================================
// 3. Effect.all（并发）vs 顺序 yield* — I/O 场景
// ============================================================

// 模拟 I/O 延迟
const fakeIO = (id: number, delayMs: number) =>
  Effect.gen(function* () {
    yield* Effect.sleep(`${delayMs} millis`)
    return `result-${id}`
  })

const demoAllVsSequential = Effect.gen(function* () {
  Console.log("\n=== 3. Effect.all（并发）vs 顺序 yield*（3 个 I/O 任务，各 50ms）===")

  const tasks = [fakeIO(1, 50), fakeIO(2, 50), fakeIO(3, 50)]

  // 顺序执行 — 总时间 ≈ 150ms
  yield* measure("顺序 yield*", Effect.gen(function* () {
    const r1 = yield* tasks[0]
    const r2 = yield* tasks[1]
    const r3 = yield* tasks[2]
    return [r1, r2, r3]
  }))

  // 并发执行 — 总时间 ≈ 50ms
  yield* measure("Effect.all 并发", Effect.all(tasks))
})

// ============================================================
// 4. Effect.forEach 默认并发 vs sequential
// ============================================================

const demoForEachConcurrency = Effect.gen(function* () {
  Console.log("\n=== 4. Effect.forEach 默认并发 vs 顺序（10 个 I/O 任务，各 20ms）===")

  const ids = Array.from({ length: 10 }, (_, i) => i)

  // 默认并发（无限制）
  yield* measure("forEach 默认并发", Effect.forEach(ids, (id) => fakeIO(id, 20)))

  // 顺序执行
  yield* measure("forEach sequential", Effect.forEach(ids, (id) => fakeIO(id, 20), { concurrency: 1 }))

  // 限制并发数
  yield* measure("forEach concurrency=3", Effect.forEach(ids, (id) => fakeIO(id, 20), { concurrency: 3 }))
})

// ============================================================
// 5. 避免不必要的 Effect 包装 — sync vs tryPromise
// ============================================================

const demoAvoidOverwrap = Effect.gen(function* () {
  Console.log("\n=== 5. 避免不必要的 Effect 包装 ===")

  // 纯计算应该用 sync，不要用 tryPromise
  yield* measure("Effect.sync (纯计算 × 10,000)", Effect.gen(function* () {
    for (let i = 0; i < 10_000; i++) {
      yield* Effect.sync(() => i * 2)
    }
  }))

  // 错误：用 tryPromise 包装同步计算 — 每次创建一个 Promise
  yield* measure("Effect.tryPromise (不必要的 Promise × 10,000)", Effect.gen(function* () {
    for (let i = 0; i < 10_000; i++) {
      yield* Effect.tryPromise(() => Promise.resolve(i * 2))
    }
  }))
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoCreationOverhead
  yield* demoFlatMapVsGen
  yield* demoAllVsSequential
  yield* demoForEachConcurrency
  yield* demoAvoidOverwrap
  Console.log("\n✅ 01-overhead-analysis.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

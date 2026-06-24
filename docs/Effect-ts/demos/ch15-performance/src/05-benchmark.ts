/**
 * 05-benchmark.ts — performance.now() 微基准测试：预热、平均、对比
 *
 * 性能分析要点：
 * - 微基准测试需要预热（warmup）消除 JIT 编译影响
 * - 多次迭代取平均值减少噪音
 * - 对比基线（baseline）了解相对开销
 * - 关注标准差判断结果稳定性
 *
 * 运行: bun run src/05-benchmark.ts
 */
import { Effect, Console } from "effect"

// ============================================================
// 工具函数：微基准测试框架
// ============================================================

interface BenchmarkResult {
  name: string
  iterations: number
  totalMs: number
  avgUs: number
  stdDevUs: number
}

const benchmark = (
  name: string,
  fn: () => void,
  iterations: number = 10_000,
  warmupRounds: number = 3,
): BenchmarkResult => {
  // 预热 — 消除 JIT 编译影响
  for (let i = 0; i < warmupRounds; i++) {
    for (let j = 0; j < iterations / 10; j++) {
      fn()
    }
  }

  // 正式测试 — 多轮取平均
  const rounds = 5
  const roundTimes: Array<number> = []

  for (let round = 0; round < rounds; round++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      fn()
    }
    roundTimes.push(performance.now() - start)
  }

  const totalMs = roundTimes.reduce((a, b) => a + b, 0) / rounds
  const avgUs = (totalMs / iterations) * 1000

  // 计算标准差
  const mean = totalMs
  const variance =
    roundTimes.reduce((sum, t) => sum + (t - mean) ** 2, 0) / rounds
  const stdDevUs = (Math.sqrt(variance) / iterations) * 1000

  return { name, iterations, totalMs, avgUs, stdDevUs }
}

const printResult = (r: BenchmarkResult) => {
  console.log(
    `  ${r.name.padEnd(30)} ${r.avgUs.toFixed(4).padStart(10)}μs/op  (σ=${r.stdDevUs.toFixed(4)}μs, ${r.iterations} iters)`,
  )
}

// ============================================================
// 1. Effect 创建开销微基准
// ============================================================

const demoEffectCreationBench = Effect.gen(function* () {
  Console.log("=== 1. Effect 创建开销微基准 ===")

  // 基线: 空函数
  printResult(benchmark("基线: 空函数", () => {}))

  // Effect.succeed
  printResult(benchmark("Effect.succeed(value)", () => Effect.succeed(42)))

  // Effect.sync
  printResult(benchmark("Effect.sync(() => value)", () => Effect.sync(() => 42)))

  // Effect.fail
  printResult(
    benchmark("Effect.fail(error)", () => Effect.fail(new Error("err"))),
  )

  // Effect.gen (最小)
  printResult(
    benchmark(
      "Effect.gen (最小)",
      () =>
        Effect.gen(function* () {
          return 42
        }),
    ),
  )

  // pipe + map
  printResult(
    benchmark(
      "pipe + Effect.map",
      () =>
        Effect.succeed(21).pipe(Effect.map((n) => n * 2)),
    ),
  )
})

// ============================================================
// 2. runSync 执行开销
// ============================================================

const demoRunSyncBench = Effect.gen(function* () {
  Console.log("\n=== 2. Effect.runSync 执行开销 ===")

  const simpleEffect = Effect.succeed(42)

  // 预构造 Effect，只测执行
  printResult(
    benchmark("runSync(预构造 succeed)", () => {
      Effect.runSync(simpleEffect)
    }),
  )

  // 创建+执行
  printResult(
    benchmark("runSync(succeed(42))", () => {
      Effect.runSync(Effect.succeed(42))
    }),
  )

  // gen + runSync
  const genEffect = Effect.gen(function* () {
    const a = yield* Effect.succeed(21)
    const b = yield* Effect.succeed(21)
    return a + b
  })

  printResult(
    benchmark("runSync(gen, 2×yield*)", () => {
      Effect.runSync(genEffect)
    }),
  )
})

// ============================================================
// 3. runPromise 异步开销
// ============================================================

const demoRunPromiseBench = Effect.gen(function* () {
  Console.log("\n=== 3. Effect.runPromise 异步开销 ===")

  const simpleEffect = Effect.succeed(42)

  // 预构造 Effect
  const start = performance.now()
  const ROUNDS = 1_000
  for (let i = 0; i < ROUNDS; i++) {
    yield* Effect.promise(() => Effect.runPromise(simpleEffect))
  }
  const totalMs = performance.now() - start
  const avgUs = (totalMs / ROUNDS) * 1000
  Console.log(`  runPromise × ${ROUNDS}: ${totalMs.toFixed(3)}ms total, ${avgUs.toFixed(4)}μs/op`)

  // 原生 Promise 对比
  const start2 = performance.now()
  for (let i = 0; i < ROUNDS; i++) {
    yield* Effect.promise(() => Promise.resolve(42))
  }
  const totalMs2 = performance.now() - start2
  const avgUs2 = (totalMs2 / ROUNDS) * 1000
  Console.log(`  原生 Promise.resolve × ${ROUNDS}: ${totalMs2.toFixed(3)}ms total, ${avgUs2.toFixed(4)}μs/op`)
  Console.log(`  开销比: ${(avgUs / avgUs2).toFixed(1)}x`)
})

// ============================================================
// 4. Effect.all 并发 vs 顺序 — 微基准
// ============================================================

const demoAllVsSeqBench = Effect.gen(function* () {
  Console.log("\n=== 4. Effect.all vs 顺序组合 — 微基准 ===")

  const tasks = Array.from({ length: 10 }, (_, i) =>
    Effect.succeed(i * 2),
  )

  // 顺序: pipe + flatMap 链
  const sequential = tasks.reduce(
    (acc, task) =>
      Effect.gen(function* () {
        const results = yield* acc
        const next = yield* task
        return [...results, next]
      }),
    Effect.succeed([] as Array<number>),
  )

  const ROUNDS = 10_000

  const start1 = performance.now()
  for (let i = 0; i < ROUNDS; i++) {
    yield* sequential
  }
  const seqMs = performance.now() - start1
  Console.log(`  顺序组合 × ${ROUNDS}: ${seqMs.toFixed(3)}ms`)

  // 并发: Effect.all
  const start2 = performance.now()
  for (let i = 0; i < ROUNDS; i++) {
    yield* Effect.all(tasks)
  }
  const allMs = performance.now() - start2
  Console.log(`  Effect.all × ${ROUNDS}: ${allMs.toFixed(3)}ms`)

  // 注意：纯同步场景 Effect.all 可能有 overhead（需要调度并发）
  // 但在 I/O 场景下，Effect.all 的并发优势远大于 overhead
  Console.log(`  说明: 纯同步场景顺序更快；I/O 场景 Effect.all 大幅领先`)
})

// ============================================================
// 5. 对比总结
// ============================================================

const demoSummary = Effect.gen(function* () {
  Console.log("\n=== 5. 性能优化总结 ===")
  Console.log("  1. Effect 创建开销极小（< 1μs），无需担心")
  Console.log("  2. runSync 开销约 1-5μs，适合高频调用")
  Console.log("  3. runPromise 比原生 Promise 多 ~2-5x 开销（类型安全代价）")
  Console.log("  4. 纯同步用 sync/runSync，异步用 tryPromise/runPromise")
  Console.log("  5. I/O 密集场景优先用 Effect.all 并发")
  Console.log("  6. 批量处理用 Cache 或 grouped 减少重复计算")
  Console.log("  7. 先测量再优化 — 不要过早优化")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoEffectCreationBench
  yield* demoRunSyncBench
  yield* demoRunPromiseBench
  yield* demoAllVsSeqBench
  yield* demoSummary
  Console.log("\n✅ 05-benchmark.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

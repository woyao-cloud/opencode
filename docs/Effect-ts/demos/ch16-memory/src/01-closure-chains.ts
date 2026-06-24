/**
 * 01-closure-chains.ts — Effect 闭包链与内存引用
 *
 * 内存管理要点：
 * - flatMap 链中的每个闭包都会捕获外部变量，形成引用链
 * - 长 flatMap 链可能累积闭包引用，阻止 GC
 * - Effect.gen 的 yield* 在每一步后释放之前的局部变量
 * - 提前将大对象引用设为 null 可以释放内存
 * - 闭包捕获的变量在其 Effect 执行完成前不会被 GC
 *
 * 运行: bun run src/01-closure-chains.ts
 */
import { Effect, Console } from "effect"

// ============================================================
// 工具：跟踪对象创建/销毁的测试桩
// ============================================================

let createdCount = 0
let destroyedCount = 0

/** 模拟一个占用大量内存的资源对象 */
class LargeObject {
  readonly id: number
  private data: Array<number>

  constructor(id: number) {
    this.id = id
    // 模拟占用内存
    this.data = new Array(10_000).fill(0).map(() => Math.random())
    createdCount++
  }

  getValue(): number {
    return this.data[0]
  }

  // 手动清理大数组引用
  dispose(): void {
    this.data = []
    destroyedCount++
  }
}

const resetCounters = Effect.sync(() => {
  createdCount = 0
  destroyedCount = 0
})

const reportCounters = (label: string) =>
  Effect.sync(() =>
    Console.log(`  ${label}: 创建=${createdCount}, 销毁=${destroyedCount}`),
  )

// ============================================================
// 1. flatMap 链：闭包引用累积
// ============================================================

/**
 * 在 flatMap 链中，每一步的闭包都会捕获外部变量。
 * 如果链很长且中间变量是大对象，它们会在整个链执行完成前保持存活。
 */
const demoFlatMapClosures = Effect.gen(function* () {
  Console.log("=== 1. flatMap 链：闭包引用累积 ===")
  yield* resetCounters

  const result = yield* Effect.succeed(0).pipe(
    // 第 1 步：创建大对象 obj1，flatMap 闭包捕获它
    Effect.flatMap((n) => {
      const obj1 = new LargeObject(1)
      return Effect.sync(() => n + obj1.getValue())
    }),
    // 第 2 步：创建大对象 obj2，闭包捕获前一步的结果
    Effect.flatMap((n) => {
      const obj2 = new LargeObject(2)
      return Effect.sync(() => n + obj2.getValue())
    }),
    // 第 3 步：创建大对象 obj3
    Effect.flatMap((n) => {
      const obj3 = new LargeObject(3)
      return Effect.sync(() => n + obj3.getValue())
    }),
  )

  Console.log(`  结果: ${result}`)
  yield* reportCounters("flatMap 链结束后")

  // 手动 dispose 以清理引用（实际代码中应使用 Scope）
  Console.log("  注意: flatMap 链中所有闭包引用的对象在链执行期间保持存活")
})

// ============================================================
// 2. Effect.gen：变量在 yield* 后释放
// ============================================================

/**
 * Effect.gen 中，每次 yield* 后前一步的局部变量可以被 GC。
 * 因为生成器在每个 yield 点暂停，JS 引擎可以回收之前的变量。
 */
const demoGenVariableRelease = Effect.gen(function* () {
  Console.log("\n=== 2. Effect.gen：变量在 yield* 后释放 ===")
  yield* resetCounters

  // 第 1 步：创建大对象
  const obj1 = new LargeObject(10)
  const step1 = yield* Effect.sync(() => obj1.getValue())
  // 在 yield* 之后，obj1 不再被引用（除非后续代码使用它）

  // 第 2 步：创建新的大对象
  const obj2 = new LargeObject(20)
  const step2 = yield* Effect.sync(() => obj2.getValue())

  // 第 3 步
  const obj3 = new LargeObject(30)
  const step3 = yield* Effect.sync(() => obj3.getValue())

  const total = step1 + step2 + step3
  Console.log(`  结果: ${total}`)
  yield* reportCounters("Effect.gen 结束后")

  // 手动清理
  obj1.dispose()
  obj2.dispose()
  obj3.dispose()
  Console.log("  说明: Effect.gen 中，yield* 后未使用的变量可被 GC 回收")
})

// ============================================================
// 3. 提前释放引用 — 主动 nullify
// ============================================================

/**
 * 在长 Effect.gen 中，如果后续还有耗时操作，
 * 应该主动将不再需要的引用设为 null。
 */
const demoEarlyRelease = Effect.gen(function* () {
  Console.log("\n=== 3. 提前释放引用 ===")
  yield* resetCounters

  // 创建一个很大的"数据集"
  let dataset: LargeObject | null = new LargeObject(100)

  const result = yield* Effect.sync(() => dataset!.getValue())
  Console.log(`  处理结果: ${result}`)

  // dataset 已经不再需要，主动释放引用
  dataset.dispose()
  dataset = null

  // 后续还有耗时操作（模拟 I/O）
  yield* Effect.sleep("10 millis")
  Console.log("  后续操作完成（dataset 已提前释放）")

  yield* reportCounters("主动释放后")
  Console.log("  说明: 不再需要的引用应主动设为 null，允许 GC 提前回收")
})

// ============================================================
// 4. 闭包捕获大对象 — 陷阱与修复
// ============================================================

/**
 * 陷阱：在 Effect.map/flatMap 闭包中捕获大对象，
 * 如果该 Effect 被延迟执行（如 sleep 后），大对象会一直存活。
 */
const demoClosureTrap = Effect.gen(function* () {
  Console.log("\n=== 4. 闭包捕获大对象的陷阱 ===")
  yield* resetCounters

  // 陷阱：大对象被闭包捕获，在 sleep 期间保持存活
  const bigData = new LargeObject(999)

  const delayedEffect = Effect.gen(function* () {
    yield* Effect.sleep("5 millis")
    // bigData 被闭包捕获，在这 5ms 内无法被 GC
    return bigData.getValue()
  })

  const result = yield* delayedEffect
  Console.log(`  延迟结果: ${result}`)

  // 修复：只捕获需要的数据，不捕获整个对象
  const capturedValue = bigData.getValue()
  bigData.dispose()

  const betterDelayedEffect = Effect.gen(function* () {
    yield* Effect.sleep("5 millis")
    return capturedValue // 只捕获原始值，不持有大对象引用
  })

  const result2 = yield* betterDelayedEffect
  Console.log(`  优化后结果: ${result2}`)
  Console.log("  说明: 只捕获需要的值，避免闭包持有整个大对象引用")
})

// ============================================================
// 5. 闭包链深度 vs 内存占用 — 可视化对比
// ============================================================

const demoChainDepth = Effect.gen(function* () {
  Console.log("\n=== 5. 闭包链深度与内存占用 ===")

  // 构建不同深度的 flatMap 链并观察对象创建数
  const buildChain = (depth: number): Effect.Effect<number> => {
    let effect: Effect.Effect<number> = Effect.succeed(0)
    for (let i = 0; i < depth; i++) {
      effect = effect.pipe(
        Effect.flatMap((n) => {
          const obj = new LargeObject(i)
          return Effect.sync(() => n + obj.getValue())
        }),
      )
    }
    return effect
  }

  for (const depth of [3, 5, 10]) {
    yield* resetCounters
    const result = yield* buildChain(depth)
    yield* reportCounters(`flatMap 深度=${depth}，结果=${result.toFixed(2)}`)
  }

  Console.log("  说明: 深度越大，同时存活的对象越多（闭包引用链累积）")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoFlatMapClosures
  yield* demoGenVariableRelease
  yield* demoEarlyRelease
  yield* demoClosureTrap
  yield* demoChainDepth
  Console.log("\n✅ 01-closure-chains.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

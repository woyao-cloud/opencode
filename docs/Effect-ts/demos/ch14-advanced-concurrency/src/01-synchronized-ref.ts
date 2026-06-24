/**
 * 01-synchronized-ref.ts — SynchronizedRef：并发安全的可变引用
 *
 * SynchronizedRef 是 Ref 的增强版，内部使用 Semaphore 保证
 * 所有操作的原子性。多个 Fiber 可以安全地并发读写同一个
 * SynchronizedRef，不会出现竞态条件。
 *
 * 核心操作：make / get / set / update / modify / getAndUpdate
 *
 * 运行: bun run src/01-synchronized-ref.ts
 */
import { Effect, SynchronizedRef, Fiber, Console } from "effect"

// ============================================================
// 1. make + get + set — 基本读写
// ============================================================

const demoBasic = Effect.gen(function* () {
  Console.log("=== 1. make / get / set — 基本读写 ===")

  // SynchronizedRef.make(value) — 创建受保护的引用
  const ref = yield* SynchronizedRef.make(0)

  const v1 = yield* SynchronizedRef.get(ref)
  Console.log(`初始值: ${v1}`)

  // set — 设置新值
  yield* SynchronizedRef.set(ref, 42)
  const v2 = yield* SynchronizedRef.get(ref)
  Console.log(`set(42) 后: ${v2}`)
})

// ============================================================
// 2. update — 原子更新（读-改-写）
// ============================================================

const demoUpdate = Effect.gen(function* () {
  Console.log("\n=== 2. update / updateAndGet / getAndUpdate ===")

  const ref = yield* SynchronizedRef.make(10)

  // update — 原子地应用函数，不返回旧值
  yield* SynchronizedRef.update(ref, (n) => n + 5)
  const v1 = yield* SynchronizedRef.get(ref)
  Console.log(`update(+5) 后: ${v1}`)

  // updateAndGet — 更新并返回新值
  const newVal = yield* SynchronizedRef.updateAndGet(ref, (n) => n * 2)
  Console.log(`updateAndGet(*2): ${newVal}`)

  // getAndUpdate — 返回旧值并更新
  const oldVal = yield* SynchronizedRef.getAndUpdate(ref, (n) => n + 100)
  Console.log(`getAndUpdate(+100): 旧值=${oldVal}, 当前=${yield* SynchronizedRef.get(ref)}`)
})

// ============================================================
// 3. modify — 原子地修改并返回任意类型结果
// ============================================================

const demoModify = Effect.gen(function* () {
  Console.log("\n=== 3. modify — 原子修改并返回自定义结果 ===")

  const ref = yield* SynchronizedRef.make(100)

  // modify: 返回 [result, newValue] 元组
  const result = yield* SynchronizedRef.modify(ref, (n) => {
    const doubled = n * 2
    const half = n / 2
    return [`原值=${n}, 翻倍=${doubled}, 折半=${half}` as const, n + 1]
  })
  Console.log(`modify 结果: ${result}`)
  Console.log(`当前值: ${yield* SynchronizedRef.get(ref)}`)
})

// ============================================================
// 4. getAndSet / setAndGet — 原子交换
// ============================================================

const demoSwap = Effect.gen(function* () {
  Console.log("\n=== 4. getAndSet / setAndGet — 原子交换 ===")

  const ref = yield* SynchronizedRef.make("hello")

  // getAndSet — 返回旧值并设置新值
  const old = yield* SynchronizedRef.getAndSet(ref, "world")
  Console.log(`getAndSet: 旧值="${old}", 当前="${yield* SynchronizedRef.get(ref)}"`)

  // setAndGet — 设置新值并返回新值
  const newVal = yield* SynchronizedRef.setAndGet(ref, "effect-ts")
  Console.log(`setAndGet: 新值="${newVal}"`)
})

// ============================================================
// 5. 多 Fiber 并发安全演示
// ============================================================

const demoConcurrent = Effect.gen(function* () {
  Console.log("\n=== 5. 多 Fiber 并发安全 ===")

  const ref = yield* SynchronizedRef.make(0)

  // 10 个 Fiber 同时递增，每个递增 100 次
  const increment = (id: number) =>
    Effect.forEach(Array.from({ length: 100 }), () =>
      SynchronizedRef.update(ref, (n) => n + 1),
    )

  const fibers = yield* Effect.all(
    Array.from({ length: 10 }, (_, i) => Effect.forkDetach(increment(i))),
  )

  // 等待所有 Fiber 完成
  yield* Effect.all(fibers.map((f) => Fiber.join(f)))

  const final = yield* SynchronizedRef.get(ref)
  Console.log(`10 个 Fiber × 100 次递增 = ${final}（预期 1000）`)
})

// ============================================================
// 6. modifyEffect — 带副作用的原子操作
// ============================================================

const demoModifyEffect = Effect.gen(function* () {
  Console.log("\n=== 6. modifyEffect — 带 Effect 的原子修改 ===")

  const ref = yield* SynchronizedRef.make<number[]>([])

  // modifyEffect 允许在原子操作中执行 Effect（如日志）
  const result = yield* SynchronizedRef.modifyEffect(ref, (arr) =>
    Effect.gen(function* () {
      const newItem = arr.length + 1
      yield* Console.log(`  [modifyEffect] 添加元素: ${newItem}`)
      return [`已添加 ${newItem}` as const, [...arr, newItem]]
    }),
  )
  Console.log(`modifyEffect 返回: ${result}`)
  Console.log(`数组内容: [${yield* SynchronizedRef.get(ref)}]`)
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  yield* demoBasic
  yield* demoUpdate
  yield* demoModify
  yield* demoSwap
  yield* demoConcurrent
  yield* demoModifyEffect
  Console.log("\n✅ 01-synchronized-ref.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

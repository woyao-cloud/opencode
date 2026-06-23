/**
 * 03-recovery-strategies.ts — 错误恢复策略
 *
 * 演示 Effect-TS 的错误恢复手段：
 * - Effect.retry: 使用 Schedule 控制重试
 * - Effect.orElse: 失败时切换到降级方案
 * - Effect.orElseSucceed: 失败时返回默认值
 * - Effect.either: 将错误转为 Either 类型（永不失败）
 *
 * 注意: beta.65 中 Effect.retry 签名需要传入 Effect 和 Schedule 两个参数，
 * 或使用 pipe + Effect.retry(schedule) 的形式。
 *
 * 运行: bun run src/03-recovery-strategies.ts
 */

import { Effect, Schedule } from "effect"

// ============================================================
// 1. Effect.retry — 使用 Schedule 控制重试
// ============================================================

console.log("=== 1. Effect.retry — 使用 Schedule 控制重试 ===\n")

// 模拟一个不稳定的服务：前 2 次失败，第 3 次成功
let callCount = 0

const unstableService = Effect.gen(function* () {
  callCount++
  if (callCount < 3) {
    return yield* Effect.fail(new Error(`第 ${callCount} 次调用失败`))
  }
  return `第 ${callCount} 次调用成功!`
})

// retry + Schedule.recurs — 最多重试 5 次
const program1a = unstableService.pipe(
  Effect.retry(Schedule.recurs(5)),
)

Effect.runPromise(program1a).then(
  (result) => console.log("重试成功:", result),
  (err) => console.log("重试耗尽:", err.message),
)

// ============================================================
// 2. Effect.retry + Schedule.exponential — 指数退避
// ============================================================

console.log("\n=== 2. Effect.retry + Schedule.exponential — 指数退避 ===\n")

// 重置计数器
callCount = 0

const program2 = unstableService.pipe(
  Effect.retry(
    Schedule.exponential("100 milliseconds").pipe(
      // 最多 3 次重试
      Schedule.compose(Schedule.recurs(3)),
    ),
  ),
)

const startTime = Date.now()
Effect.runPromise(program2).then((result) => {
  const elapsed = Date.now() - startTime
  console.log("重试成功:", result)
  console.log(`耗时: ${elapsed}ms（含指数退避等待）`)
})

// ============================================================
// 3. Effect.orElse — 失败时切换到降级方案
// ============================================================

console.log("\n=== 3. Effect.orElse — 失败时切换到降级方案 ===\n")

// 主服务
const primaryService = (fail: boolean): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    if (fail) {
      return yield* Effect.fail(new Error("主服务不可用"))
    }
    return "主服务数据"
  })

// 降级服务（备用方案）
const fallbackService = (): Effect.Effect<string, Error> =>
  Effect.succeed("降级缓存数据")

// orElse: 主服务失败时使用降级服务
const program3a = primaryService(true).pipe(
  Effect.orElse(() => fallbackService()),
)

Effect.runPromise(program3a).then((result) =>
  console.log("主服务失败 → 降级结果:", result),
)

// 主服务成功时 orElse 不执行
const program3b = primaryService(false).pipe(
  Effect.orElse(() => fallbackService()),
)

Effect.runPromise(program3b).then((result) =>
  console.log("主服务成功 → 原始结果:", result),
)

// ============================================================
// 4. Effect.orElseSucceed — 失败时返回默认值
// ============================================================

console.log("\n=== 4. Effect.orElseSucceed — 失败时返回默认值 ===\n")

// orElseSucceed 比 orElse + Effect.succeed 更简洁
// 它将 Effect<E, A> 变为 Effect<never, A>

const riskyOperation = (fail: boolean): Effect.Effect<number, Error> =>
  Effect.gen(function* () {
    if (fail) {
      return yield* Effect.fail(new Error("计算失败"))
    }
    return 42
  })

// 失败时返回默认值 0
const program4a = riskyOperation(true).pipe(
  Effect.orElseSucceed(() => 0),
)

Effect.runPromise(program4a).then((result) =>
  console.log("失败 → 默认值:", result),
)

// 成功时返回原始值
const program4b = riskyOperation(false).pipe(
  Effect.orElseSucceed(() => 0),
)

Effect.runPromise(program4b).then((result) =>
  console.log("成功 → 原始值:", result),
)

// 链式恢复: 多层降级策略
const program4c = riskyOperation(true).pipe(
  // 第一层: 尝试从缓存恢复
  Effect.orElse(() => Effect.succeed(100)),
  // 第二层: 如果上面也失败，返回默认值
  Effect.orElseSucceed(() => 0),
)

Effect.runPromise(program4c).then((result) =>
  console.log("链式降级:", result),
)

// ============================================================
// 5. Effect.either — 将错误转为 Either 类型
// ============================================================

console.log("\n=== 5. Effect.either — 错误转为 Either ===\n")

// Effect.either 将 Effect<E, A> 转为 Effect<never, Either<E, A>>
// 好处: 永远不会失败，错误变成普通数据

const mayFail = (fail: boolean): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    if (fail) {
      return yield* Effect.fail(new Error("操作失败"))
    }
    return "操作成功"
  })

// 失败的情况: Either 包含 Left
const program5a = mayFail(true).pipe(Effect.either)

Effect.runPromise(program5a).then((either) => {
  if (either._tag === "Left") {
    console.log("Either.Left — 错误:", either.left.message)
  } else {
    console.log("Either.Right — 成功:", either.right)
  }
})

// 成功的情况: Either 包含 Right
const program5b = mayFail(false).pipe(Effect.either)

Effect.runPromise(program5b).then((either) => {
  if (either._tag === "Left") {
    console.log("Either.Left — 错误:", either.left.message)
  } else {
    console.log("Either.Right — 成功:", either.right)
  }
})

// either 的实用场景: 批量操作中允许部分失败
const items = [1, 2, -1, 3, -2] // -1 和 -2 会失败

const validateItem = (n: number): Effect.Effect<number, string> =>
  Effect.gen(function* () {
    if (n < 0) {
      return yield* Effect.fail(`负数不允许: ${n}`)
    }
    return n * 10
  })

const batchProcess = Effect.all(
  items.map((n) => validateItem(n).pipe(Effect.either)),
)

Effect.runPromise(batchProcess).then((results) => {
  console.log("\n批量处理结果（部分失败不影响整体）:")
  results.forEach((either, i) => {
    if (either._tag === "Left") {
      console.log(`  [${items[i]}] ❌ ${either.left}`)
    } else {
      console.log(`  [${items[i]}] ✅ ${either.right}`)
    }
  })
})

// ============================================================
// 6. 恢复策略对比总结
// ============================================================

console.log("\n=== 6. 恢复策略对比 ===\n")

console.log("策略               | 行为                          | 结果类型变化")
console.log("-------------------|-------------------------------|------------------------------")
console.log("retry(schedule)    | 失败时按计划重试              | 错误类型不变")
console.log("orElse(fallback)   | 失败时切换到降级 Effect       | E → E2（降级可能也有错误）")
console.log("orElseSucceed(val) | 失败时返回默认值              | E → never")
console.log("either             | 错误转为 Either 数据          | E → never, A → Either<E, A>")

console.log("\n✅ 03-recovery-strategies.ts 运行完成")

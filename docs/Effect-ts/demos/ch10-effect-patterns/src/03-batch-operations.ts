/**
 * 03-batch-operations.ts — 批量操作
 *
 * 演示 Effect-TS 的批量处理模式：
 * - Effect.forEach — 遍历执行
 * - Effect.forEach + concurrency — 并发遍历
 * - Effect.all — 并行执行多个 Effect
 * - Effect.all + concurrency — 控制并发度
 * - Effect.allSuccesses — 只取成功的结果
 * - Effect.partition — 分离成功和失败
 *
 * 运行: bun run src/03-batch-operations.ts
 */

import { Effect, Array } from "effect"

// ============================================================
// 1. Effect.forEach — 遍历执行
// ============================================================

console.log("=== 1. Effect.forEach — 遍历执行 ===\n")

const items1 = [1, 2, 3, 4, 5]

// forEach: 对数组中的每个元素执行 Effect，收集结果
const program1 = Effect.forEach(items1, (n) =>
  Effect.succeed(n * 10),
)

Effect.runPromise(program1).then((result) =>
  console.log("forEach 结果:", result),
)

// ============================================================
// 2. Effect.forEach + concurrency — 并发遍历
// ============================================================

console.log("\n=== 2. Effect.forEach + concurrency — 并发遍历 ===\n")

const items2 = [1, 2, 3, 4, 5]

// 顺序执行: 每个操作依次执行
const sequential = Effect.forEach(items2, (n) =>
  Effect.succeed(n).pipe(
    Effect.tap(() => Effect.sync(() => console.log(`  顺序处理: ${n}`))),
  ),
)

// 并发执行: 所有操作同时执行
const concurrent = Effect.forEach(items2, (n) =>
  Effect.succeed(n).pipe(
    Effect.tap(() => Effect.sync(() => console.log(`  并发处理: ${n}`))),
  ),
  { concurrency: "unbounded" },
)

console.log("顺序执行:")
Effect.runPromise(sequential).then((result) =>
  console.log("顺序结果:", result),
).then(() => {
  console.log("\n并发执行:")
  return Effect.runPromise(concurrent)
}).then((result) =>
  console.log("并发结果:", result),
)

// ============================================================
// 3. Effect.all — 并行执行多个 Effect
// ============================================================

console.log("\n=== 3. Effect.all — 并行执行多个 Effect ===\n")

// all: 将多个 Effect 组合为一个，并行执行
const program3 = Effect.all([
  Effect.succeed("A"),
  Effect.succeed("B"),
  Effect.succeed("C"),
])

Effect.runPromise(program3).then((result) =>
  console.log("Effect.all 结果:", result),
)

// 使用对象形式: 结果保留字段名
const program3b = Effect.all({
  user: Effect.succeed("Alice"),
  age: Effect.succeed(30),
  role: Effect.succeed("admin"),
})

Effect.runPromise(program3b).then((result) =>
  console.log("Effect.all（对象）结果:", result),
)

// ============================================================
// 4. Effect.all + concurrency — 控制并发度
// ============================================================

console.log("\n=== 4. Effect.all + concurrency — 控制并发度 ===\n")

const tasks = Array.makeBy(10, (i) =>
  Effect.succeed(`任务 ${i + 1}`).pipe(
    Effect.tap(() => Effect.sync(() => console.log(`  执行任务 ${i + 1}`))),
  ),
)

// 限制并发度为 3
const program4 = Effect.all(tasks, { concurrency: 3 })

Effect.runPromise(program4).then((result) =>
  console.log("并发度 3 的结果:", result),
)

// ============================================================
// 5. 使用 partition 只取成功的结果
// ============================================================

console.log("\n=== 5. 使用 partition 只取成功的结果 ===\n")

const mixedItems = ["成功 A", "失败 B", "成功 C", "失败 D", "成功 E"]

const processItem = (item: string): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    if (item.startsWith("失败")) {
      return yield* Effect.fail(new Error(item))
    }
    return item
  })

// 使用 partition 分离成功和失败，然后只取成功部分
const program5 = Effect.partition(mixedItems, processItem, { concurrency: "unbounded" })

Effect.runPromise(program5).then(([failures, successes]) => {
  console.log("成功的结果:", successes)
  console.log("失败的结果:", failures.map((f) => f.message))
})

// ============================================================
// 6. Effect.partition — 分离成功和失败
// ============================================================

console.log("\n=== 6. Effect.partition — 分离成功和失败 ===\n")

const items6 = [1, 2, -1, 3, -2, 4, -3]

const validate = (n: number): Effect.Effect<number, string> =>
  Effect.gen(function* () {
    if (n < 0) {
      return yield* Effect.fail(`负数: ${n}`)
    }
    return n * 10
  })

// partition: 将结果分为 [成功数组, 失败数组]
const program6 = Effect.partition(items6, validate, { concurrency: "unbounded" })

Effect.runPromise(program6).then(([failures, successes]) => {
  console.log("成功:", successes)
  console.log("失败:", failures)
})

// ============================================================
// 7. 实用模式: 批量处理 + 部分失败容忍
// ============================================================

console.log("\n=== 7. 实用模式: 批量处理 + 部分失败容忍 ===\n")

interface User {
  readonly id: number
  readonly name: string
}

const users: Array<User> = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Charlie" },
]

const fetchProfile = (user: User): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    // 模拟 API 调用，id 为偶数的用户成功
    if (user.id % 2 === 0) {
      return yield* Effect.fail(new Error(`${user.name} 的 profile 不可用`))
    }
    return `${user.name} 的 profile 数据`
  })

// 使用 partition 容忍部分失败
const program7 = Effect.partition(users, fetchProfile, { concurrency: 2 })

Effect.runPromise(program7).then(([failures, successes]) => {
  console.log("成功获取的 profiles:", successes)
  console.log("失败的 profiles:", failures.map((f) => f.message))
})

console.log("\n✅ 03-batch-operations.ts 运行完成")

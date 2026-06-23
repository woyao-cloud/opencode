/**
 * 03-generator-syntax.ts — Effect.gen 与 yield*
 *
 * 学习目标: 掌握 Effect.gen 生成器语法，理解 yield* 解包 Effect 的机制，
 *          学习 Effect.all 并发和 Effect.forEach 批量处理，
 *          对比 gen/yield* 与 async/await 的异同
 * 前置章节: 02-pipe-and-flow.ts
 * 运行方式: bun run src/03-generator-syntax.ts
 */

import { Effect } from "effect"

// ============================================================
// 1. Effect.gen 基本语法
// ============================================================
// Effect.gen(function* () { ... }) 创建一个 Effect
// 在 generator 函数内部，用 yield* 解包 Effect 获取其成功值
// 语法类似 async/await，但类型系统跟踪错误

console.log("--- 1. Effect.gen 基本语法 ---")

// 定义一些模拟的操作（使用 Effect.try 捕获异常）
const fetchUserName = (id: number): Effect.Effect<never, Error, string> =>
  Effect.try({
    try: () => {
      if (id <= 0) throw new Error(`无效的用户 ID: ${id}`)
      return `用户_${id}`
    },
    catch: (err) => err as Error,
  })

const fetchUserScore = (name: string): Effect.Effect<never, Error, number> =>
  Effect.try({
    try: () => {
      if (name === "用户_0") throw new Error("无法获取分数")
      return Math.floor(Math.random() * 100) + 1
    },
    catch: (err) => err as Error,
  })

// 使用 gen 组合多个 Effect
const getUserReport = Effect.gen(function* () {
  // yield* 解包 Effect，获取成功值（类似 await）
  const name = yield* fetchUserName(42)
  console.log(`  获取到用户名: ${name}`)

  const score = yield* fetchUserScore(name)
  console.log(`  获取到分数: ${score}`)

  // 可以直接使用解包后的值进行纯计算
  const grade = score >= 60 ? "及格" : "不及格"

  return { name, score, grade }
})

console.log("gen 组合结果:", Effect.runSync(getUserReport))

// ============================================================
// 2. gen 中的错误传播
// ============================================================
// 当 yield* 的 Effect 失败时，错误会自动向上传播
// 不需要 try/catch — 类型系统已经跟踪了错误

console.log("\n--- 2. gen 中的错误传播 ---")

const failingProgram = Effect.gen(function* () {
  console.log("  开始执行...")
  const name = yield* fetchUserName(-1) // 这里会失败！
  console.log("  这行不会执行:", name)
  return "完成"
})

Effect.runPromiseExit(failingProgram).then((exit) =>
  console.log("错误自动传播:", exit.toString())
)

// ============================================================
// 3. Effect.all — 并发执行多个 Effect
// ============================================================
// Effect.all([e1, e2, e3]) 并发执行所有 Effect
// 成功: 返回所有结果的数组
// 失败: 任何一个失败，整体失败（默认行为）

console.log("\n--- 3. Effect.all 并发执行 ---")

const concurrentProgram = Effect.gen(function* () {
  console.log("  并发获取三个用户的数据...")

  // 三个 Effect 同时执行，而不是依次等待
  const [name1, name2, name3] = yield* Effect.all([
    fetchUserName(1),
    fetchUserName(2),
    fetchUserName(3),
  ])

  console.log(`  结果: ${name1}, ${name2}, ${name3}`)
  return [name1, name2, name3]
})

console.log("Effect.all 结果:", Effect.runSync(concurrentProgram))

// ============================================================
// 4. Effect.forEach — 批量处理
// ============================================================
// Effect.forEach(items, fn) 对每个元素应用 fn，并发执行
// 返回所有结果的数组

console.log("\n--- 4. Effect.forEach 批量处理 ---")

const batchProgram = Effect.gen(function* () {
  const ids = [10, 20, 30, 40, 50]
  console.log(`  批量处理 ${ids.length} 个 ID...`)

  const names = yield* Effect.forEach(ids, (id) => fetchUserName(id))

  console.log(`  获取到的用户名: ${names.join(", ")}`)
  return names
})

console.log("forEach 结果:", Effect.runSync(batchProgram))

// ============================================================
// 5. gen 与 async/await 的对比
// ============================================================
console.log("\n--- 5. gen/yield* 与 async/await 对比 ---")

console.log("┌──────────────────────┬─────────────────────────────────┬─────────────────────────────────┐")
console.log("│ 特性                 │ async/await                     │ gen/yield*                      │")
console.log("├──────────────────────┼─────────────────────────────────┼─────────────────────────────────┤")
console.log("│ 语法                 │ async function + await          │ Effect.gen(function*) + yield*  │")
console.log("│ 错误类型             │ unknown (类型丢失)              │ 精确跟踪 (E 类型参数)           │")
console.log("│ 依赖注入             │ 无标准方案                      │ R 类型参数 + Layer              │")
console.log("│ 并发                 │ Promise.all                     │ Effect.all                      │")
console.log("│ 可取消               │ AbortController (手动)         │ Fiber 自动支持                  │")
console.log("│ 可重试               │ 手工实现                        │ Effect.retry 内置               │")
console.log("│ 类型安全             │ 部分 (错误类型丢失)            │ 完全 (R/E/A 全覆盖)             │")
console.log("└──────────────────────┴─────────────────────────────────┴─────────────────────────────────┘")

console.log("\n关键理解:")
console.log("  - yield* 不是 await — 它解包的是 Effect，不是 Promise")
console.log("  - 在 gen 中绝对不能使用 await，必须使用 yield*")
console.log("  - gen 中的错误会自动沿 yield* 链向上传播")
console.log("  - Effect.all 默认并发，比 Promise.all 有更丰富的配置选项")

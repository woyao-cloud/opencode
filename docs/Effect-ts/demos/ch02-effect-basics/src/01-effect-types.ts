/**
 * 01-effect-types.ts — Effect<R, E, A> 三参数模型
 *
 * 学习目标: 理解 Effect 类型的三个类型参数（R=依赖, E=错误, A=成功值），
 *          掌握创建 Effect 的六种基本方式，观察类型参数如何随操作变化
 * 前置章节: 第 1 章（为什么需要 Effect-TS）
 * 运行方式: bun run src/01-effect-types.ts
 */

import { Effect } from "effect"

// ============================================================
// 1. Effect.succeed — 总是成功的 Effect
// ============================================================
// 类型: Effect<never, never, A>
// R=never: 不需要任何依赖
// E=never: 永远不会失败
// A=string: 成功时产生 string

const succeedEffect: Effect.Effect<string> = Effect.succeed("Hello Effect!")
// 等价于: Effect.Effect<never, never, string>

console.log("--- 1. Effect.succeed ---")
console.log("创建了一个总是成功的 Effect，值为:", Effect.runSync(succeedEffect))

// ============================================================
// 2. Effect.fail — 总是失败的 Effect
// ============================================================
// 类型: Effect<never, E, never>
// R=never: 不需要任何依赖
// E=string: 失败时产生 string 类型的错误
// A=never: 永远不会成功

const failEffect: Effect.Effect<never, string> = Effect.fail("网络连接失败")
// 等价于: Effect.Effect<never, string, never>

console.log("\n--- 2. Effect.fail ---")
console.log("创建了一个总是失败的 Effect，错误为:", "网络连接失败")
// 注意: 直接 runSync 会抛出异常，这里用 runPromiseExit 安全获取结果
Effect.runPromiseExit(failEffect).then((exit) => console.log("Exit 结果:", exit.toString()))

// ============================================================
// 3. Effect.sync — 同步可能抛异常的计算
// ============================================================
// 类型: Effect<never, never, A>
// 注意: sync 假设函数不会抛异常，如果抛了，异常会变成"未定义行为"(defect)
// 适合: 纯计算、JSON.parse（已知合法输入）、数学运算

const syncEffect = Effect.sync(() => {
  const result = 1 + 2 + 3
  console.log("  计算过程: 1 + 2 + 3 =", result)
  return result
})
// 类型: Effect<never, never, number>

console.log("\n--- 3. Effect.sync ---")
console.log("同步计算结果:", Effect.runSync(syncEffect))

// ============================================================
// 4. Effect.try — 同步可能抛异常，自动转为 fail
// ============================================================
// 类型: Effect<never, Error, A>
// 与 sync 的区别: try 会捕获函数中抛出的异常，将其转为 Effect 的 E 通道
// API: Effect.try({ try: () => ..., catch: (err) => ... })
// 适合: JSON.parse（未知输入）、文件读取等可能失败的操作

const trySuccess = Effect.try({
  try: () => {
    const parsed = JSON.parse('{"name": "Alice", "age": 30}')
    return parsed.name as string
  },
  catch: (err) => new Error(`JSON 解析失败: ${(err as Error).message}`),
})
// 类型: Effect<never, Error, string>

const tryFailure = Effect.try({
  try: () => {
    // 故意传入非法 JSON
    JSON.parse("{invalid json}")
    return "不会到达这里"
  },
  catch: (err) => new Error(`JSON 解析失败: ${(err as Error).message}`),
})
// 类型: Effect<never, Error, string>

console.log("\n--- 4. Effect.try ---")
console.log("try 成功:", Effect.runSync(trySuccess))
Effect.runPromiseExit(tryFailure).then((exit) =>
  console.log("try 失败 (异常被自动捕获):", exit.toString())
)

// ============================================================
// 5. Effect.tryPromise — Promise → Effect（捕获异常）
// ============================================================
// 类型: Effect<never, Error, A>
// 将 Promise 包装为 Effect，同时捕获 Promise rejection 和同步异常
// 适合: 调用第三方异步 API（fetch、数据库查询等）

// 模拟一个可能失败的异步操作（如数据库查询、API 调用）
const tryPromiseEffect = Effect.tryPromise(() =>
  new Promise<string>((resolve, reject) =>
    setTimeout(() => {
      // 模拟 80% 成功率
      if (Math.random() > 0.2) {
        resolve("异步数据获取成功")
      } else {
        reject(new Error("网络超时"))
      }
    }, 100)
  )
)
// 类型: Effect<never, Error, string>

console.log("\n--- 5. Effect.tryPromise ---")
Effect.runPromise(tryPromiseEffect).then((data) =>
  console.log("tryPromise 成功获取数据:", data)
).catch(() =>
  console.log("tryPromise 失败 (异常被自动捕获为 Error 类型)")
)

// ============================================================
// 6. Effect.promise — Promise → Effect（不捕获异常）
// ============================================================
// 类型: Effect<never, never, A>
// 与 tryPromise 的区别: promise 假设 Promise 不会 reject
// 如果 Promise reject，异常会变成"未定义行为"(defect)，不会被类型系统跟踪
// 适合: 你 100% 确定不会失败的 Promise

const promiseEffect = Effect.promise(() =>
  Promise.resolve("这条 Promise 永远不会 reject")
)
// 类型: Effect<never, never, string>

console.log("\n--- 6. Effect.promise ---")
Effect.runPromise(promiseEffect).then((value) =>
  console.log("promise 结果:", value)
)

// ============================================================
// 7. 类型参数总结
// ============================================================
console.log("\n--- 7. 类型参数总结 ---")
console.log("┌────────────────────┬───────────┬───────────┬───────────┐")
console.log("│ 创建方式           │ R (依赖)  │ E (错误)  │ A (成功)  │")
console.log("├────────────────────┼───────────┼───────────┼───────────┤")
console.log("│ Effect.succeed     │ never     │ never     │ 指定类型  │")
console.log("│ Effect.fail        │ never     │ 指定类型  │ never     │")
console.log("│ Effect.sync        │ never     │ never     │ 指定类型  │")
console.log("│ Effect.try         │ never     │ Error     │ 指定类型  │")
console.log("│ Effect.tryPromise  │ never     │ Error     │ 指定类型  │")
console.log("│ Effect.promise     │ never     │ never     │ 指定类型  │")
console.log("└────────────────────┴───────────┴───────────┴───────────┘")
console.log("\n关键理解:")
console.log("  - R=never 表示不需要依赖（后续章节会引入 R 的使用）")
console.log("  - E=never 表示不会产生可恢复的错误")
console.log("  - E=Error 表示可能产生 Error 类型的可恢复错误")
console.log("  - A=never 表示不会产生成功值（总是失败）")

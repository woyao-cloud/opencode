/**
 * 02-pipe-and-flow.ts — pipe 与 flow 组合
 *
 * 学习目标: 掌握 pipe/flow 管道组合方式，理解 Effect.map/flatMap/tap/andThen
 *          等变换操作，观察类型如何在管道中传递
 * 前置章节: 01-effect-types.ts
 * 运行方式: bun run src/02-pipe-and-flow.ts
 */

import { Effect, pipe, flow } from "effect"

// ============================================================
// 1. pipe — 管道组合（值 → 函数 → 函数 → ...）
// ============================================================
// pipe 将前一个函数的输出作为后一个函数的输入
// 适合: 对同一个值依次应用多个变换

console.log("--- 1. pipe 基本用法 ---")

const result1 = pipe(
  5,                          // 初始值: number
  (n: number) => n * 2,      // → 10
  (n: number) => n + 3,      // → 13
  (n: number) => `结果是 ${n}` // → "结果是 13"
)
console.log("pipe 组合结果:", result1)

// ============================================================
// 2. flow — 创建组合函数（函数 → 函数 → ... → 新函数）
// ============================================================
// flow 与 pipe 类似，但不立即执行，而是返回一个新函数
// 适合: 定义可复用的变换管道

console.log("\n--- 2. flow 基本用法 ---")

const doubleThenAdd3 = flow(
  (n: number) => n * 2,
  (n: number) => n + 3,
  (n: number) => `结果是 ${n}`
)
// doubleThenAdd3 的类型: (n: number) => string

console.log("flow(5):", doubleThenAdd3(5))
console.log("flow(10):", doubleThenAdd3(10))

// ============================================================
// 3. Effect.map — 变换成功值 A
// ============================================================
// map 对 Effect 的成功值进行变换，不影响 R 和 E
// 类型: Effect<R, E, A> → Effect<R, E, B>

console.log("\n--- 3. Effect.map ---")

const fetchUserName = Effect.succeed({ name: "Alice", age: 30 })

const getName = pipe(
  fetchUserName,
  Effect.map((user) => user.name)  // 提取 name 字段
)
// fetchUserName: Effect<never, never, {name, age}>
// getName:       Effect<never, never, string>

console.log("map 提取 name:", Effect.runSync(getName))

// map 链式变换
const getGreeting = pipe(
  fetchUserName,
  Effect.map((user) => user.name),
  Effect.map((name) => `你好, ${name}!`)
)
console.log("map 链式变换:", Effect.runSync(getGreeting))

// ============================================================
// 4. Effect.flatMap — 依赖前一个结果创建新 Effect
// ============================================================
// flatMap 用前一个 Effect 的成功值创建下一个 Effect，然后"展平"
// 类型: Effect<R, E, A> → (A → Effect<R, E, B>) → Effect<R, E, B>
// 适合: 需要根据前一步结果决定下一步做什么

console.log("\n--- 4. Effect.flatMap ---")

// 模拟: 根据用户 ID 决定是否允许访问
const checkAccess = (id: number): Effect.Effect<never, string, string> =>
  id > 0
    ? Effect.succeed(`用户 ${id} 有访问权限`)
    : Effect.fail(`用户 ${id} 无访问权限`)

const accessProgram = pipe(
  Effect.succeed(42),
  Effect.flatMap((id) => checkAccess(id))
)
console.log("flatMap 成功:", Effect.runSync(accessProgram))

const accessProgramFail = pipe(
  Effect.succeed(-1),
  Effect.flatMap((id) => checkAccess(id))
)
Effect.runPromiseExit(accessProgramFail).then((exit) =>
  console.log("flatMap 失败:", exit.toString())
)

// ============================================================
// 5. Effect.tap — 副作用观察（不改变值）
// ============================================================
// tap 在管道中插入副作用（日志、监控等），但不改变流经的值
// 类型: Effect<R, E, A> → Effect<R, E, A>（类型不变！）

console.log("\n--- 5. Effect.tap ---")

const withLogging = pipe(
  Effect.succeed({ name: "Bob", score: 95 }),
  Effect.tap((user) => Effect.sync(() => console.log("  [日志] 处理用户:", user.name))),
  Effect.map((user) => user.score),
  Effect.tap((score) => Effect.sync(() => console.log("  [日志] 分数:", score))),
  Effect.map((score) => score >= 60 ? "及格" : "不及格")
)
console.log("tap 结果:", Effect.runSync(withLogging))

// ============================================================
// 6. Effect.andThen — 顺序组合
// ============================================================
// andThen 在当前 Effect 成功后执行下一个 Effect
// 与 flatMap 的区别: andThen 忽略前一个 Effect 的成功值
// 适合: "先做 A，然后做 B"，B 不依赖 A 的结果

console.log("\n--- 6. Effect.andThen ---")

const sequential = pipe(
  Effect.sync(() => console.log("  步骤 1: 初始化完成")),
  Effect.andThen(Effect.sync(() => console.log("  步骤 2: 连接数据库"))),
  Effect.andThen(Effect.sync(() => console.log("  步骤 3: 启动服务"))),
  Effect.andThen(Effect.succeed("系统就绪"))
)
console.log("andThen 结果:", Effect.runSync(sequential))

// ============================================================
// 7. 类型在管道中的传递
// ============================================================
console.log("\n--- 7. 类型传递总结 ---")
console.log("初始 Effect:  Effect<R, E, A>")
console.log("  .map(fn)     → Effect<R, E, B>        (A 变了，R/E 不变)")
console.log("  .flatMap(fn) → Effect<R, E2, B>       (A 变了，E 可能扩大)")
console.log("  .tap(fn)     → Effect<R, E, A>        (类型完全不变)")
console.log("  .andThen(e2) → Effect<R, E2, B>       (A 变为 e2 的 A，E 可能扩大)")
console.log("\n关键理解:")
console.log("  - pipe/flow 让类型在每一步自动推导，无需手动标注")
console.log("  - map 是最安全的变换：只改成功值，不影响错误类型")
console.log("  - flatMap 可能扩大错误类型（因为新 Effect 可能引入新错误）")

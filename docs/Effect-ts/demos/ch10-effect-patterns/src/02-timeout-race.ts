/**
 * 02-timeout-race.ts — 超时与竞态
 *
 * 演示 Effect-TS 的超时和竞态模式：
 * - Effect.timeout — 超时控制
 * - Effect.timeoutOrElse — 超时时执行降级
 * - Effect.race — 两个 Effect 竞态（取第一个成功）
 * - Effect.raceAll — 多个 Effect 竞态
 * - Effect.raceFirst — 取第一个完成的（无论成功或失败）
 *
 * 运行: bun run src/02-timeout-race.ts
 */

import { Effect, Duration } from "effect"

// ============================================================
// 1. Effect.timeout — 超时控制
// ============================================================

console.log("=== 1. Effect.timeout — 超时控制 ===\n")

// 模拟一个耗时操作
const slowOperation = (ms: number): Effect.Effect<string> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(ms))
    return `操作完成（耗时 ${ms}ms）`
  })

// 超时 100ms，但操作需要 200ms → 超时失败
const program1a = slowOperation(200).pipe(
  Effect.timeout(Duration.millis(100)),
)

Effect.runPromise(program1a).then(
  (result) => console.log("未超时:", result),
  (err) => console.log("超时失败:", err.message),
)

// 超时 200ms，操作只需要 100ms → 正常完成
const program1b = slowOperation(100).pipe(
  Effect.timeout(Duration.millis(200)),
)

Effect.runPromise(program1b).then(
  (result) => console.log("未超时:", result),
  (err) => console.log("超时失败:", err.message),
)

// ============================================================
// 2. Effect.timeoutOrElse — 超时时执行降级
// ============================================================

console.log("\n=== 2. Effect.timeoutOrElse — 超时时执行降级 ===\n")

// timeoutOrElse: 超时时不直接失败，而是执行一个降级 Effect
const program2 = slowOperation(200).pipe(
  Effect.timeoutOrElse({
    duration: Duration.millis(100),
    orElse: () => Effect.succeed("降级: 使用缓存数据"),
  }),
)

Effect.runPromise(program2).then((result) =>
  console.log("timeoutOrElse 结果:", result),
)

// ============================================================
// 3. Effect.race — 两个 Effect 竞态
// ============================================================

console.log("\n=== 3. Effect.race — 两个 Effect 竞态 ===\n")

// race: 两个 Effect 同时执行，取第一个成功的结果
// 如果两个都失败，返回最后一个错误
const fastSuccess = Effect.succeed("快速成功").pipe(
  Effect.delay(Duration.millis(50)),
)

const slowSuccess = Effect.succeed("慢速成功").pipe(
  Effect.delay(Duration.millis(100)),
)

const program3a = Effect.race(fastSuccess, slowSuccess)

Effect.runPromise(program3a).then((result) =>
  console.log("race 结果（快 vs 慢）:", result),
)

// 如果快的失败，race 会等待慢的
const fastFail = Effect.fail(new Error("快速失败")).pipe(
  Effect.delay(Duration.millis(30)),
)

const program3b = Effect.race(fastFail, slowSuccess)

Effect.runPromise(program3b).then(
  (result) => console.log("race 结果（快失败 vs 慢成功）:", result),
  (err) => console.log("race 失败:", err.message),
)

// ============================================================
// 4. Effect.raceAll — 多个 Effect 竞态
// ============================================================

console.log("\n=== 4. Effect.raceAll — 多个 Effect 竞态 ===\n")

// raceAll: 从多个 Effect 中取第一个成功的结果
const fast = Effect.succeed("A（最快）").pipe(
  Effect.delay(Duration.millis(30)),
)
const medium = Effect.succeed("B（中等）").pipe(
  Effect.delay(Duration.millis(60)),
)
const slow = Effect.succeed("C（最慢）").pipe(
  Effect.delay(Duration.millis(90)),
)

const program4 = Effect.raceAll([fast, medium, slow])

Effect.runPromise(program4).then((result) =>
  console.log("raceAll 结果:", result),
)

// ============================================================
// 5. Effect.raceFirst — 取第一个完成的
// ============================================================

console.log("\n=== 5. Effect.raceFirst — 取第一个完成的 ===\n")

// raceFirst: 取第一个完成的 Effect（无论成功还是失败）
// 与 race 不同：race 在第一个失败时会等待下一个成功
// raceFirst 在第一个完成时立即返回（可能是失败）

const failFast = Effect.fail(new Error("快速失败")).pipe(
  Effect.delay(Duration.millis(20)),
)

const succeedSlow = Effect.succeed("慢速成功").pipe(
  Effect.delay(Duration.millis(100)),
)

const program5 = Effect.raceFirst(failFast, succeedSlow)

Effect.runPromise(program5).then(
  (result) => console.log("raceFirst 结果:", result),
  (err) => console.log("raceFirst 失败（第一个完成的失败了）:", err.message),
)

// ============================================================
// 6. 实用模式: 超时 + 降级 + 竞态
// ============================================================

console.log("\n=== 6. 实用模式: 超时 + 降级 + 竞态 ===\n")

// 模拟从多个数据源获取数据，取最快成功的
const sourceA = Effect.succeed("数据源 A").pipe(
  Effect.delay(Duration.millis(150)),
)
const sourceB = Effect.succeed("数据源 B").pipe(
  Effect.delay(Duration.millis(100)),
)
const sourceC = Effect.fail(new Error("数据源 C 不可用")).pipe(
  Effect.delay(Duration.millis(50)),
)

// 从三个数据源竞态获取，整体超时 200ms
const program6 = Effect.raceAll([sourceA, sourceB, sourceC]).pipe(
  Effect.timeoutOrElse({
    duration: Duration.millis(200),
    orElse: () => Effect.succeed("所有数据源超时，使用缓存"),
  }),
)

Effect.runPromise(program6).then((result) =>
  console.log("多数据源竞态结果:", result),
)

console.log("\n✅ 02-timeout-race.ts 运行完成")

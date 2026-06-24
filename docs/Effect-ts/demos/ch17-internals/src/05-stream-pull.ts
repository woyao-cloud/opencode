/**
 * Demo 05: Stream Pull-Based Implementation Model
 *
 * 展示 Stream 的 pull-based（拉取模式）内部实现模型。
 * Effect-TS 的 Stream 采用 pull-based 模型：消费者主动从生产者"拉取"数据，
 * 而非生产者"推送"数据给消费者。
 *
 * 关键概念：
 * - Pull-based: 下游按需拉取，避免上游生产超过下游消费能力
 * - Stream<R, E, A> 的每一步返回一个 Effect，决定下一步行为
 * - 三种可能的步骤：Emit（发射元素）、Skip（跳过）、Halt（停止）
 * - 背压（backpressure）自然实现：消费者不拉取时生产者不生产
 * - Stream 可以组合：concat、merge、zip 等
 */

import { Effect, Stream, pipe } from "effect"

// ============================================================
// 简化版 Pull-Based Stream 模型（仅供理解，非生产代码）
// ============================================================

/**
 * Stream 步骤 —— 拉取操作的可能结果
 *
 * 当消费者拉取时，Stream 返回以下三种结果之一：
 * - Emit: 产生一个值，并提供剩余 Stream
 * - Skip: 跳过当前元素，继续拉取
 * - Halt: Stream 结束（成功或失败）
 */
type PullStep<R, E, A> =
  | { readonly _tag: "Emit"; readonly value: A; readonly rest: SimplifiedStream<R, E, A> }
  | { readonly _tag: "Skip"; readonly rest: SimplifiedStream<R, E, A> }
  | { readonly _tag: "Halt"; readonly exit: { _tag: "Success" } | { _tag: "Failure"; error: E } }

/**
 * 简化的 Stream 类型
 *
 * Stream 本质上是一个函数：给定环境 R，返回一个 Effect，
 * 这个 Effect 执行后产生 PullStep，决定下一步行为。
 *
 * 真实的 Effect-TS Stream 使用更复杂的编码（Channel 抽象），
 * 但 pull-based 的核心思想不变。
 */
interface SimplifiedStream<R, E, A> {
  readonly pull: (env: R) => Effect.Effect<PullStep<R, E, A>, E>
}

// ============================================================
// Stream 构造器
// ============================================================

/** 从数组创建 Stream */
const fromArray = <R, E, A>(values: readonly A[]): SimplifiedStream<R, E, A> => {
  let index = 0

  const pull = (): Effect.Effect<PullStep<R, E, A>, E> =>
    Effect.sync(() => {
      if (index >= values.length) {
        return { _tag: "Halt" as const, exit: { _tag: "Success" as const } }
      }
      const value = values[index++]!
      return {
        _tag: "Emit" as const,
        value,
        rest: { pull: pull as any }
      }
    })

  return { pull: pull as any }
}

/** 创建一个重复产生值的 Stream */
const repeat = <A>(value: A): SimplifiedStream<never, never, A> => {
  const pull = (): Effect.Effect<PullStep<never, never, A>, never> =>
    Effect.sync(() => ({
      _tag: "Emit" as const,
      value,
      rest: { pull: pull as any }
    }))

  return { pull: pull as any }
}

/** 从单个值创建 Stream */
const succeed = <A>(value: A): SimplifiedStream<never, never, A> =>
  fromArray([value])

/** 空 Stream */
const empty: SimplifiedStream<never, never, never> = {
  pull: () => Effect.sync(() => ({ _tag: "Halt" as const, exit: { _tag: "Success" as const } }))
}

// ============================================================
// Stream 操作符
// ============================================================

/**
 * map —— 对每个元素应用转换函数
 *
 * 在 pull-based 模型中，map 是惰性的：
 * 只有被拉取时才转换，而非预先生成所有数据。
 */
const map = <R, E, A, B>(
  stream: SimplifiedStream<R, E, A>,
  f: (a: A) => B
): SimplifiedStream<R, E, B> => ({
  pull: (env: R) =>
    Effect.flatMap(stream.pull(env), (step) => {
      if (step._tag === "Emit") {
        return Effect.succeed({
          _tag: "Emit" as const,
          value: f(step.value),
          rest: map(step.rest, f)
        })
      }
      return Effect.succeed(step as any)
    })
})

/**
 * take —— 取前 n 个元素
 *
 * 每次拉取时递减计数器，达到 0 时发出 Halt。
 */
const take = <R, E, A>(
  stream: SimplifiedStream<R, E, A>,
  n: number
): SimplifiedStream<R, E, A> => {
  if (n <= 0) return empty

  return {
    pull: (env: R) =>
      Effect.flatMap(stream.pull(env), (step) => {
        if (step._tag === "Emit") {
          return Effect.succeed({
            _tag: "Emit" as const,
            value: step.value,
            rest: take(step.rest, n - 1)
          })
        }
        return Effect.succeed(step)
      })
  }
}

/**
 * filter —— 过滤元素
 *
 * 被过滤掉的元素返回 Skip，消费者继续拉取下一个。
 */
const filter = <R, E, A>(
  stream: SimplifiedStream<R, E, A>,
  predicate: (a: A) => boolean
): SimplifiedStream<R, E, A> => ({
  pull: (env: R) =>
    Effect.flatMap(stream.pull(env), (step) => {
      if (step._tag === "Emit") {
        if (predicate(step.value)) {
          return Effect.succeed({
            _tag: "Emit" as const,
            value: step.value,
            rest: filter(step.rest, predicate)
          })
        }
        // 不满足条件 → Skip
        return Effect.succeed({
          _tag: "Skip" as const,
          rest: filter(step.rest, predicate)
        })
      }
      return Effect.succeed(step)
    })
})

// ============================================================
// Stream 消费者（run 函数）
// ============================================================

/**
 * runCollect —— 收集 Stream 的所有元素
 *
 * 不断拉取直到 Halt，收集所有 Emit 的元素。
 * 这展示了 pull-based 模型的核心消费模式。
 */
const runCollect = <R, E, A>(
  stream: SimplifiedStream<R, E, A>,
  env: R
): Effect.Effect<readonly A[], E> => {
  const go = (
    current: SimplifiedStream<R, E, A>,
    acc: A[]
  ): Effect.Effect<readonly A[], E> =>
    Effect.flatMap(current.pull(env), (step) => {
      switch (step._tag) {
        case "Emit":
          return go(step.rest, [...acc, step.value])
        case "Skip":
          return go(step.rest, acc)
        case "Halt":
          if (step.exit._tag === "Success") {
            return Effect.succeed(acc)
          }
          return Effect.fail(step.exit.error)
      }
    })

  return go(stream, [])
}

/**
 * 简化版 run —— 执行 Stream 并收集结果
 */
const run = <R, E, A>(stream: SimplifiedStream<R, E, A>, env: R): Promise<readonly A[]> =>
  Effect.runPromise(runCollect(stream, env))

// ============================================================
// 演示：Pull-Based Stream 模型
// ============================================================

console.log("=".repeat(60))
console.log("Demo 05: Stream Pull-Based 实现模型")
console.log("=".repeat(60))

console.log("\n--- 简化版 Pull-Based Stream 演示 ---")

// 创建一个 Stream 并应用操作符
const simplifiedProgram = pipe(
  fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  (s) => map(s, (n) => n * 10),
  (s) => filter(s, (n) => n > 30),
  (s) => take(s, 3)
)

console.log("Stream 管道: fromArray → map(*10) → filter(>30) → take(3)")
console.log("开始拉取...")

// 逐步展示拉取过程
const tracePull = (stream: SimplifiedStream<never, never, number>, count = 0) => {
  if (count >= 5) return // safety limit
  const step = Effect.runSync(stream.pull(undefined as any))
  console.log(`  Pull #${count + 1}: ${step._tag}${step._tag === "Emit" ? `(${step.value})` : ""}`)
  if (step._tag === "Emit" || step._tag === "Skip") {
    tracePull(step.rest, count + 1)
  }
}

tracePull(simplifiedProgram)

// 使用 runCollect 收集结果
run(simplifiedProgram, undefined as any).then((results) => {
  console.log(`\n✅ 收集结果: [${results.join(", ")}]`)
})

// ============================================================
// 演示：使用真实 Effect-TS Stream
// ============================================================

console.log("\n--- 真实 Effect-TS Stream 对比 ---")

const realStreamProgram = pipe(
  Stream.fromIterable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  Stream.map((n) => {
    console.log(`  🔄 处理元素: ${n}`)
    return n * 10
  }),
  Stream.filter((n) => n > 30),
  Stream.take(3),
  Stream.runCollect
)

Effect.runPromise(realStreamProgram).then((result) => {
  console.log(`✅ 收集结果: [${result.join(", ")}]`)
})

// ============================================================
// 背压（Backpressure）演示
// ============================================================

console.log("\n--- 背压演示：慢消费者 ---")

// 模拟慢消费者：生产速度快，但消费慢
const fastProducer = Stream.repeat(1)

// 使用 take(3) 限制，展示背压自然发生
const backpressureDemo = pipe(
  Stream.fromIterable([1, 2, 3, 4, 5]),
  Stream.mapEffect((n) =>
    pipe(
      Effect.log(`⚡ 生产: ${n}`),
      Effect.flatMap(() => Effect.sleep("50 millis")),
      Effect.as(n)
    )
  ),
  Stream.tap((n) => Effect.log(`📥 消费: ${n}`)),
  Stream.runCollect
)

Effect.runPromise(backpressureDemo).then(() => {
  console.log("✅ 背压演示完成 —— 消费者按自己节奏拉取")
})

// ============================================================
// Pull Step 可视化
// ============================================================

console.log("\n--- Pull Step 状态转换可视化 ---")

const visualStream = fromArray(["A", "B", "C"])
console.log("Stream: ['A', 'B', 'C']")
console.log("")

const visualize = (stream: SimplifiedStream<never, never, string>, stepNum = 0) => {
  if (stepNum >= 5) return
  const step = Effect.runSync(stream.pull(undefined as any))
  const arrow = "→".repeat(stepNum + 1)
  console.log(`${arrow} Pull #${stepNum + 1}: [${step._tag}]${step._tag === "Emit" ? ` value="${step.value}"` : ""}`)
  if (step._tag !== "Halt") {
    visualize(step.rest, stepNum + 1)
  } else {
    console.log(`${arrow} Stream 结束 (${step.exit._tag})`)
  }
}

visualize(visualStream)

// ============================================================
// 知识点总结
// ============================================================
console.log("\n📚 关键概念:")
console.log("1. Pull-based: 消费者主动拉取，控制数据流速")
console.log("2. PullStep 三种结果: Emit（产生）、Skip（跳过）、Halt（停止）")
console.log("3. 背压自然实现：消费者不拉取，生产者不生产")
console.log("4. 操作符是惰性的：map/filter 在被拉取时才执行")
console.log("5. Stream 组合基于 pull 模型的链式调用")
console.log("6. 真实 Effect-TS 使用 Channel 抽象，更通用但原理相同")

/**
 * Demo 01: Simplified Effect Type Internals (ADT Representation)
 *
 * 展示 Effect 类型的内部 ADT（代数数据类型）表示。
 * 真实的 Effect-TS 使用更复杂的 GADT 编码，但核心思想是：
 * Effect 是一个描述计算的数据结构，运行时通过解释器执行它。
 *
 * 关键概念：
 * - Effect<R, E, A> 表示一个需要环境 R、可能失败于 E、成功产生 A 的程序
 * - 内部使用 tag 区分不同操作（Success, Failure, FlatMap, Async 等）
 * - FlatMap 是单子绑定的核心，支持顺序组合
 * - 解释器通过模式匹配执行不同的 case
 */

import { Effect, pipe } from "effect"

// ============================================================
// 简化版 Effect 类型的 ADT 定义（仅供理解，非生产代码）
// ============================================================

/**
 * 简化版 Effect ADT —— Effect 类型的内部表示模型
 *
 * 真实的 Effect-TS 源码中，Effect 使用更高级的类型技巧（GADT、phantom types、
 * variance annotations），但底层仍然是 tagged union 的思想。
 *
 * 这个简化模型帮助理解：
 * 1. Effect 是数据结构，不是副作用
 * 2. 运行时通过解释 tag 来执行不同的行为
 * 3. FlatMap 是实现顺序组合的关键
 */

// 简化的 Effect 类型定义（仅作教学演示）
type SimplifiedEffect<R, E, A> =
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Failure"; readonly error: E }
  | { readonly _tag: "Sync"; readonly thunk: () => A }
  | { readonly _tag: "Async"; readonly register: (cb: (result: Either<E, A>) => void) => void }
  | { readonly _tag: "FlatMap"; readonly self: SimplifiedEffect<R, E, any>; readonly f: (a: any) => SimplifiedEffect<R, E, A> }
  | { readonly _tag: "Access"; readonly f: (r: R) => SimplifiedEffect<R, E, A> }
  | { readonly _tag: "Provide"; readonly self: SimplifiedEffect<R, E, A>; readonly env: R }

type Either<E, A> = { readonly _tag: "Left"; readonly left: E } | { readonly _tag: "Right"; readonly right: A }

// 构造器：创建一个成功的 Effect
const succeed = <A>(value: A): SimplifiedEffect<never, never, A> =>
  ({ _tag: "Success", value })

// 构造器：创建一个失败的 Effect
const fail = <E>(error: E): SimplifiedEffect<never, E, never> =>
  ({ _tag: "Failure", error })

// 构造器：从同步函数创建 Effect
const sync = <A>(thunk: () => A): SimplifiedEffect<never, never, A> =>
  ({ _tag: "Sync", thunk })

// 构造器：从异步操作创建 Effect
const async = <A>(register: (cb: (result: Either<never, A>) => void) => void): SimplifiedEffect<never, never, A> =>
  ({ _tag: "Async", register })

/**
 * 简化的解释器 —— 递归执行 Effect ADT
 *
 * 真实的 Effect-TS 运行时比这复杂得多，包括：
 * - 蹦床（trampoline）避免栈溢出
 * - Fiber 调度器管理并发
 * - 资源安全和 finalization
 * - 结构化并发支持
 *
 * 这里的简化版本仅展示核心思想。
 */
const runSimplified = <R, E, A>(
  effect: SimplifiedEffect<R, E, A>,
  env: R,
  callback: (result: Either<E, A>) => void
): void => {
  const run = (current: SimplifiedEffect<R, E, A>): void => {
    switch (current._tag) {
      case "Success":
        callback({ _tag: "Right", right: current.value })
        return

      case "Failure":
        callback({ _tag: "Left", left: current.error })
        return

      case "Sync":
        // 执行同步操作并将结果转为成功
        callback({ _tag: "Right", right: current.thunk() })
        return

      case "Async":
        // 注册异步回调
        current.register(callback)
        return

      case "FlatMap": {
        // FlatMap 的核心：先执行 self，然后将结果传给 f 继续执行
        run(current.self as any)
        // 注意：真实实现需要在回调中继续，这里是简化版
        return
      }

      case "Access":
        // 从环境中读取并继续
        run(current.f(env))
        return

      case "Provide":
        // 提供环境给子 Effect
        runSimplified(current.self, current.env, callback)
        return
    }
  }

  run(effect)
}

// ============================================================
// 演示：使用简化的 Effect ADT
// ============================================================

// 构建一个简单的 Effect 程序
const program = pipe(
  sync(() => {
    console.log("🔧 [简化运行时] 执行同步计算...")
    return 42
  }),
  // 在真实 Effect-TS 中，flatMap 等价于 Effect.flatMap
  // 这里演示 ADT 如何表示这种组合
)

console.log("=".repeat(60))
console.log("Demo 01: Effect 内部 ADT 表示")
console.log("=".repeat(60))

// 使用简化运行时执行
runSimplified(program, undefined as any, (result) => {
  if (result._tag === "Right") {
    console.log(`✅ 结果: ${result.right}`)
  }
})

// ============================================================
// 对比：使用真实 Effect-TS 的等价代码
// ============================================================

const realProgram = pipe(
  Effect.sync(() => {
    console.log("🔧 [真实运行时] 执行同步计算...")
    return 42
  }),
  Effect.map((n) => n * 2)
)

console.log("\n--- 真实 Effect-TS 对比 ---")
Effect.runPromise(realProgram).then((result) => {
  console.log(`✅ 真实 Effect 结果: ${result}`)
})

// ============================================================
// 知识点总结
// ============================================================
console.log("\n📚 关键概念:")
console.log("1. Effect 是描述计算的数据结构，不是副作用本身")
console.log("2. ADT (Algebraic Data Type) 用 tagged union 表示不同操作")
console.log("3. FlatMap case 实现了顺序组合（单子绑定）")
console.log("4. 解释器通过模式匹配执行不同的 tag")
console.log("5. 真实实现远比这复杂，但核心思想一致")

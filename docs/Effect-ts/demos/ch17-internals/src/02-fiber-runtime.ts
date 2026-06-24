/**
 * Demo 02: Fiber Runtime Event Loop Model
 *
 * 展示 Fiber 运行时的事件循环模型。
 * Fiber 是 Effect-TS 并发模型的核心 —— 每个 Effect 在 Fiber 上运行，
 * 运行时调度器负责在 Fiber 之间切换。
 *
 * 关键概念：
 * - Fiber 是轻量级"虚拟线程"，比 OS 线程开销小得多
 * - 运行时有一个事件循环，不断从就绪队列中取出 Fiber 执行
 * - 每个 Fiber 有一个执行栈（类似 call stack）
 * - 协作式调度：Fiber 通过 yield 主动让出执行权
 * - 结构化并发：父 Fiber 监督子 Fiber 的生命周期
 */

import { Effect, pipe } from "effect"

// ============================================================
// 简化版 Fiber 运行时模型（仅供理解，非生产代码）
// ============================================================

/**
 * Fiber 状态机
 *
 * 真实的 Effect-TS 中 Fiber 状态远比这复杂（包括 interrupting、done 等），
 * 这里简化为最基本的三种状态。
 */
type FiberStatus =
  | { _tag: "Running" }
  | { _tag: "Suspended"; reason: string }
  | { _tag: "Done"; result: any }

/**
 * 简化的 Fiber 数据结构
 *
 * 每个 Fiber 包含：
 * - id: 唯一标识
 * - status: 当前状态
 * - parent: 父 Fiber（用于结构化并发）
 * - children: 子 Fiber 集合
 */
interface SimplifiedFiber {
  readonly id: number
  status: FiberStatus
  parent: SimplifiedFiber | null
  children: Set<SimplifiedFiber>
}

// Fiber ID 生成器
let nextFiberId = 0

const createFiber = (parent: SimplifiedFiber | null = null): SimplifiedFiber => {
  const fiber: SimplifiedFiber = {
    id: ++nextFiberId,
    status: { _tag: "Running" },
    parent,
    children: new Set()
  }
  if (parent) {
    parent.children.add(fiber)
  }
  return fiber
}

/**
 * 简化的事件循环模型
 *
 * 真实的 Effect-TS 运行时使用高度优化的调度器，
 * 支持优先级、公平调度、工作窃取等策略。
 * 这里简化为一个轮询就绪队列的基本模型。
 */
class SimplifiedRuntime {
  // 就绪队列：等待执行的 Fiber
  private readyQueue: SimplifiedFiber[] = []

  // 当前正在执行的 Fiber
  private currentFiber: SimplifiedFiber | null = null

  // 是否正在运行
  private running = false

  // 调度一个 Fiber 到就绪队列
  schedule(fiber: SimplifiedFiber): void {
    this.readyQueue.push(fiber)
  }

  // 当前 Fiber 主动让出执行权
  yield(reason: string): void {
    if (this.currentFiber) {
      this.currentFiber.status = { _tag: "Suspended", reason }
      // 将当前 Fiber 放回队列末尾
      this.readyQueue.push(this.currentFiber)
    }
  }

  /**
   * 事件循环主函数
   *
   * 不断从就绪队列中取出 Fiber 执行，直到队列为空。
   * 这是协作式调度的核心 —— 每个 Fiber 执行一小段后让出。
   */
  run(): void {
    this.running = true
    let tickCount = 0

    while (this.running && this.readyQueue.length > 0) {
      const fiber = this.readyQueue.shift()!
      this.currentFiber = fiber

      tickCount++
      console.log(`  ⏱️  Tick #${tickCount}: 执行 Fiber #${fiber.id}`)

      // 模拟执行一小段工作
      // 真实实现中这里会执行 Effect 指令
      fiber.status = { _tag: "Running" }

      // 模拟：每个 Fiber 执行 3 个 tick 后自动让出
      if (tickCount % 3 === 0) {
        console.log(`    ⏸️  Fiber #${fiber.id} 让出执行权`)
        this.yield("time slice exhausted")
      } else {
        fiber.status = { _tag: "Done", result: `Fiber #${fiber.id} result` }
        console.log(`    ✅ Fiber #${fiber.id} 完成`)

        // 检查并回收子 Fiber
        this.collectChildren(fiber)
      }
    }

    console.log(`\n📊 事件循环结束，共执行 ${tickCount} 个 tick`)
    this.running = false
  }

  // 回收已完成的子 Fiber（结构化并发的一部分）
  private collectChildren(fiber: SimplifiedFiber): void {
    for (const child of fiber.children) {
      if (child.status._tag === "Done") {
        console.log(`    🧹 回收子 Fiber #${child.id}`)
        fiber.children.delete(child)
      }
    }
  }

  stop(): void {
    this.running = false
  }
}

// ============================================================
// 演示：简化运行时的事件循环
// ============================================================

console.log("=".repeat(60))
console.log("Demo 02: Fiber 运行时事件循环模型")
console.log("=".repeat(60))

console.log("\n--- 简化版事件循环演示 ---")

const runtime = new SimplifiedRuntime()

// 创建根 Fiber
const rootFiber = createFiber()
console.log(`🌳 根 Fiber #${rootFiber.id} 已创建`)

// 创建子 Fiber
const child1 = createFiber(rootFiber)
const child2 = createFiber(rootFiber)
console.log(`👶 子 Fiber #${child1.id}, #${child2.id} 已创建`)

// 将 Fiber 加入调度队列
runtime.schedule(rootFiber)
runtime.schedule(child1)
runtime.schedule(child2)
runtime.schedule(createFiber(rootFiber)) // 额外的子 Fiber
runtime.schedule(createFiber(null))       // 独立的根 Fiber

console.log(`\n📋 就绪队列中有 ${(runtime as any).readyQueue.length} 个 Fiber`)
console.log("\n▶️  启动事件循环...\n")
runtime.run()

// ============================================================
// 演示：使用真实 Effect-TS Fiber 并发
// ============================================================

console.log("\n--- 真实 Effect-TS Fiber 演示 ---")

/**
 * 使用 Effect.all 实现并发，效果等价于 fork + join
 *
 * Effect.all 内部会为每个子 Effect 创建 Fiber 并等待完成，
 * 展示了 Fiber 运行时的事件循环和调度。
 */
const fiberProgram = Effect.all(
  [
    pipe(
      Effect.log("👶 子 Fiber 1 开始"),
      Effect.flatMap(() => Effect.sleep("100 millis")),
      Effect.flatMap(() => Effect.log("👶 子 Fiber 1 完成")),
      Effect.as("result-1")
    ),
    pipe(
      Effect.log("👶 子 Fiber 2 开始"),
      Effect.flatMap(() => Effect.sleep("50 millis")),
      Effect.flatMap(() => Effect.log("👶 子 Fiber 2 完成")),
      Effect.as("result-2")
    )
  ],
  { concurrency: "unbounded" }
)

Effect.runPromise(fiberProgram).then((results) => {
  console.log(`🏁 最终结果: [${results.join(", ")}]`)
})

// ============================================================
// 知识点总结
// ============================================================
console.log("\n📚 关键概念:")
console.log("1. Fiber 是轻量级执行单元，比线程开销小得多")
console.log("2. 运行时事件循环轮询就绪队列中的 Fiber")
console.log("3. 协作式调度：Fiber 主动让出，而非抢占式")
console.log("4. 结构化并发：父 Fiber 监督子 Fiber 生命周期")
console.log("5. Effect.forkDetach 创建并发 Fiber，Fiber.join 等待结果")

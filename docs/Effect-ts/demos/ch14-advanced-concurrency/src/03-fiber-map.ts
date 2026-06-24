/**
 * 03-fiber-map.ts — FiberMap：可索引的 Fiber 集合
 *
 * FiberMap 是一个键值索引的 Fiber 集合。当关联的 Scope 关闭时，
 * 所有 Fiber 会被自动中断。Fiber 完成后自动从集合中移除。
 *
 * 核心操作：make / run / set / get / remove / size / awaitEmpty / join
 *
 * OpenCode 参考: packages/opencode/src/control-plane/workspace.ts
 *   使用 FiberMap 管理每个 workspace 的同步 Fiber
 *
 * 运行: bun run src/03-fiber-map.ts
 */
import { Effect, FiberMap, Fiber, Console, Scope } from "effect"

// ============================================================
// 1. make + run — 创建并启动任务
// ============================================================

const demoBasic = Effect.gen(function* () {
  Console.log("=== 1. make / run — 启动并追踪 Fiber ===")

  // FiberMap.make<K>() — 创建键值索引的 Fiber 集合
  // 需要 Scope 上下文（通过 Effect.scoped 提供）
  const map = yield* FiberMap.make<string>()

  // FiberMap.run — 启动 Effect 并将 Fiber 加入集合
  const fiber1 = yield* FiberMap.run(map, "task-1", Effect.succeed("Hello"))
  const fiber2 = yield* FiberMap.run(map, "task-2", Effect.succeed("World"))

  const r1 = yield* Fiber.join(fiber1)
  const r2 = yield* Fiber.join(fiber2)
  Console.log(`结果: ${r1}, ${r2}`)

  const size = yield* FiberMap.size(map)
  Console.log(`FiberMap 大小: ${size}（Fiber 完成后自动移除）`)
})

// ============================================================
// 2. set + get — 手动管理 Fiber
// ============================================================

const demoSetGet = Effect.gen(function* () {
  Console.log("\n=== 2. set / get — 手动管理 Fiber ===")

  const map = yield* FiberMap.make<string>()

  // 手动 fork 一个 Fiber
  const fiber = yield* Effect.forkDetach(Effect.sleep("500 millis").pipe(Effect.andThen(Effect.succeed("done"))))

  // set — 将已有 Fiber 加入集合
  yield* FiberMap.set(map, "manual-task", fiber)

  // get — 查询指定 key 的 Fiber（返回 Option）
  const found = yield* FiberMap.get(map, "manual-task")
  Console.log(`找到 Fiber: ${found._tag}`)

  // 查询不存在的 key
  const missing = yield* FiberMap.get(map, "non-existent")
  Console.log(`不存在的 key: ${missing._tag}`)

  // 等待 Fiber 完成
  yield* Fiber.join(fiber)
  Console.log("Fiber 完成")
})

// ============================================================
// 3. remove + clear — 移除和清空
// ============================================================

const demoRemove = Effect.gen(function* () {
  Console.log("\n=== 3. remove / clear — 移除 Fiber ===")

  const map = yield* FiberMap.make<string>()

  // 启动几个不自动结束的 Fiber（Effect.never）
  yield* FiberMap.run(map, "never-1", Effect.never)
  yield* FiberMap.run(map, "never-2", Effect.never)
  yield* FiberMap.run(map, "never-3", Effect.never)

  const size1 = yield* FiberMap.size(map)
  Console.log(`初始大小: ${size1}`)

  // remove — 移除指定 key 的 Fiber（会中断它）
  yield* FiberMap.remove(map, "never-1")
  const size2 = yield* FiberMap.size(map)
  Console.log(`remove("never-1") 后: ${size2}`)

  // clear — 清空所有 Fiber（全部中断）
  yield* FiberMap.clear(map)
  const size3 = yield* FiberMap.size(map)
  Console.log(`clear() 后: ${size3}`)
})

// ============================================================
// 4. join + awaitEmpty — 等待所有 Fiber 完成
// ============================================================

const demoJoin = Effect.gen(function* () {
  Console.log("\n=== 4. join / awaitEmpty — 等待所有 Fiber ===")

  const map = yield* FiberMap.make<string>()

  // 启动多个耗时任务
  yield* FiberMap.run(map, "fast", Effect.sleep("100 millis").pipe(Effect.andThen(Effect.succeed("fast done"))))
  yield* FiberMap.run(map, "slow", Effect.sleep("300 millis").pipe(Effect.andThen(Effect.succeed("slow done"))))

  Console.log("等待所有 Fiber 完成...")

  // awaitEmpty — 等待集合变为空（所有 Fiber 完成）
  yield* FiberMap.awaitEmpty(map)

  Console.log("所有 Fiber 已完成！")
})

// ============================================================
// 5. Scope 关闭 — 自动中断所有 Fiber
// ============================================================

const demoScopeCleanup = Effect.gen(function* () {
  Console.log("\n=== 5. Scope 关闭 — 自动清理 ===")

  // FiberMap 与 Scope 绑定，Scope 关闭时所有 Fiber 被中断
  const result = yield* Effect.scoped(
    Effect.gen(function* () {
      const map = yield* FiberMap.make<string>()

      // 启动永不结束的 Fiber
      yield* FiberMap.run(map, "infinite-1", Effect.never)
      yield* FiberMap.run(map, "infinite-2", Effect.never)

      const size = yield* FiberMap.size(map)
      Console.log(`Scope 内 Fiber 数量: ${size}`)

      return "scope 即将关闭"
    }),
  )

  Console.log(`Scope 已关闭: ${result}`)
  Console.log("所有 Fiber 已被自动中断")
})

// ============================================================
// 6. makeRuntime — 创建运行时执行函数
// ============================================================

const demoMakeRuntime = Effect.gen(function* () {
  Console.log("\n=== 6. makeRuntime — 运行时执行函数 ===")

  // makeRuntime 返回一个函数，可以用 key 启动 Effect 并自动管理 Fiber
  const run = yield* FiberMap.makeRuntime<never, string>()

  // 使用返回的函数启动任务
  const fiber1 = run("job-a", Effect.succeed("result-a"))
  const fiber2 = run("job-b", Effect.succeed("result-b"))

  const r1 = yield* Fiber.join(fiber1)
  const r2 = yield* Fiber.join(fiber2)
  Console.log(`结果: ${r1}, ${r2}`)
})

// ============================================================
// 7. 实战: 并发任务管理器
// ============================================================

const demoTaskManager = Effect.gen(function* () {
  Console.log("\n=== 7. 实战: 并发任务管理器 ===")

  const map = yield* FiberMap.make<string, string>()

  // 模拟多个不同耗时的任务
  yield* FiberMap.run(map, "download", Effect.gen(function* () {
    yield* Effect.sleep("200 millis")
    return "下载完成"
  }))

  yield* FiberMap.run(map, "process", Effect.gen(function* () {
    yield* Effect.sleep("150 millis")
    return "处理完成"
  }))

  yield* FiberMap.run(map, "upload", Effect.gen(function* () {
    yield* Effect.sleep("100 millis")
    return "上传完成"
  }))

  // 查询运行中的任务
  const size = yield* FiberMap.size(map)
  Console.log(`运行中的任务: ${size}`)

  // 等待所有任务完成
  yield* FiberMap.awaitEmpty(map)
  Console.log("所有任务完成！")
})

// ============================================================
// 运行所有场景
// ============================================================

const program = Effect.gen(function* () {
  // 场景 1 和 2 需要 Scope 上下文
  yield* Effect.scoped(Effect.gen(function* () {
    yield* demoBasic
    yield* demoSetGet
    yield* demoRemove
  }))
  yield* Effect.scoped(Effect.gen(function* () {
    yield* demoJoin
  }))
  yield* demoScopeCleanup
  yield* Effect.scoped(Effect.gen(function* () {
    yield* demoMakeRuntime
    yield* demoTaskManager
  }))
  Console.log("\n✅ 03-fiber-map.ts 运行完成")
})

;(async () => {
  try {
    await Effect.runPromise(program)
  } catch (err) {
    console.error("运行失败:", (err as Error).message)
  }
})()

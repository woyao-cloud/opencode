import { Effect, Console, Fiber } from "effect"

const childTask = (name: string) =>
  Effect.gen(function* () {
    yield* Effect.sleep("500 millis")
    yield* Console.log("  [子任务 " + name + "] 完成")
    return "子任务 " + name + " 结果"
  })

const parentTask = Effect.gen(function* () {
  yield* Console.log("[父任务] 开始")
  const fiber1 = yield* Effect.forkChild(childTask("A"))
  const fiber2 = yield* Effect.forkChild(childTask("B"))
  yield* Console.log("[父任务] 等待子任务...")
  const r1 = yield* Fiber.join(fiber1)
  const r2 = yield* Fiber.join(fiber2)
  yield* Console.log("[父任务] 结果: " + r1 + ", " + r2)
  yield* Console.log("[父任务] 完成")
})

Effect.runPromise(parentTask)

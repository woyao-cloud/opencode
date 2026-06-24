import { Effect, Fiber, Scope } from "effect"

console.log("Effect.forkScoped:", typeof Effect.forkScoped)
console.log("Effect.forkIn:", typeof Effect.forkIn)

// Test forkScoped
const program = Effect.gen(function* () {
  // forkScoped 让 fiber 在 scope 关闭时自动中断
  const fiber = yield* Effect.forkScoped(
    Effect.sleep("5 seconds").pipe(Effect.map(() => "done")),
  )

  yield* Fiber.interrupt(fiber)

  const exit = yield* Fiber.await(fiber)
  console.log("exit._tag:", exit._tag)
})

Effect.runPromise(Effect.scoped(program))

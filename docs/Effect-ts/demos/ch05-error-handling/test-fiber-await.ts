import { Effect, Fiber } from "effect"

const program = Effect.gen(function* () {
  const fiber = yield* Effect.sleep("1 second").pipe(Effect.fork)
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  console.log("exit._tag:", exit._tag)
  console.log("exit:", exit)
})

Effect.runPromise(program)

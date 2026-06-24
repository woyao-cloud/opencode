import { Effect, Fiber } from "effect"

// Check fork signature
console.log("Effect.fork:", typeof Effect.fork)
console.log("Fiber.interrupt:", typeof Fiber.interrupt)
console.log("Fiber.await:", typeof Fiber.await)

// Test simple fork
const program = Effect.gen(function* () {
  // Use the fork that's on the Effect
  const fiber = yield* Effect.fork(Effect.sleep("1 second"))
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  console.log("exit._tag:", exit._tag)
})

Effect.runPromise(program)

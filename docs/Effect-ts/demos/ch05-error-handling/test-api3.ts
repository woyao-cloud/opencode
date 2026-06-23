import { Effect } from "effect"

// Check for orElse alternative
console.log("orElse in Effect:", "orElse" in Effect)
console.log("orDie in Effect:", "orDie" in Effect)
console.log("orDieWith in Effect:", "orDieWith" in Effect)
console.log("orElseFail in Effect:", "orElseFail" in Effect)

// Check for either alternative
console.log("either in Effect:", "either" in Effect)
console.log("exit in Effect:", "exit" in Effect)

// Check retry API variants
console.log("retry in Effect:", "retry" in Effect)

// Check catch signature
console.log("catch signature:", Effect.catch.toString().slice(0, 150))

// Check catchIf signature
console.log("catchIf signature:", Effect.catchIf.toString().slice(0, 150))

// Test catch (general) as catchAll alternative
const r = Effect.fail(new Error("any")).pipe(
  Effect.catch((e) => Effect.succeed(`caught: ${e.message}`)),
)
Effect.runPromise(r).then((x) => console.log("catch as catchAll:", x))

// Test retry with Schedule
import { Schedule } from "effect"
let calls = 0
const unstable = Effect.gen(function* () {
  calls++
  if (calls < 3) return yield* Effect.fail(new Error(`fail ${calls}`))
  return `success at call ${calls}`
})
const retried = unstable.pipe(
  Effect.retry(Schedule.recurs(5)),
)
Effect.runPromise(retried).then(
  (x) => console.log("retry with Schedule:", x),
  (e) => console.log("retry exhausted:", e.message),
)

// Check exit
const ex = Effect.fail(new Error("fail")).pipe(Effect.exit)
Effect.runPromise(ex).then((x) => console.log("exit works:", x._tag))

// Check if we can use exit instead of either
console.log("exit in Effect:", "exit" in Effect)

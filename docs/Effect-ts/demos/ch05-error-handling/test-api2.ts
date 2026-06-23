import { Effect } from "effect"

// Check orElse
console.log("orElse in Effect:", "orElse" in Effect)

// Check orElseSucceed
console.log("orElseSucceed in Effect:", "orElseSucceed" in Effect)

// Check either
console.log("either in Effect:", "either" in Effect)

// Check retry options
console.log("retry in Effect:", "retry" in Effect)

// Test orElseSucceed
if ("orElseSucceed" in Effect) {
  const r = Effect.fail(new Error("fail")).pipe(
    Effect.orElseSucceed(() => "default"),
  )
  Effect.runPromise(r).then((x) => console.log("orElseSucceed works:", x))
}

// Test either
if ("either" in Effect) {
  const r = Effect.fail(new Error("fail")).pipe(Effect.either)
  Effect.runPromise(r).then((x) => console.log("either works:", x._tag))
}

// Test catch (the general version)
console.log("catch in Effect:", "catch" in Effect)

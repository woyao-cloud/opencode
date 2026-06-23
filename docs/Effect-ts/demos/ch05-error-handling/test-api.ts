import { Effect } from "effect"

// Test catchIf (equivalent to catchSome)
const r1 = Effect.fail(new Error("test")).pipe(
  Effect.catchIf(
    (e) => e.message === "test",
    () => Effect.succeed("caught by catchIf"),
  ),
)
Effect.runPromise(r1).then((x) => console.log("catchIf works:", x))

// Test catchAll = catch with a predicate that always returns true
const r2 = Effect.fail(new Error("any error")).pipe(
  Effect.catchIf(
    () => true,
    (e) => Effect.succeed(`caught: ${e.message}`),
  ),
)
Effect.runPromise(r2).then((x) => console.log("catchAll via catchIf:", x))

// Test catchTag with _tag
const r3 = Effect.fail({ _tag: "MyError" as const, msg: "oops" }).pipe(
  Effect.catchTag("MyError", (e) => Effect.succeed(`caught by catchTag: ${e.msg}`)),
)
Effect.runPromise(r3).then((x) => console.log("catchTag works:", x))

// Test retry
const r4 = Effect.fail(new Error("retry me")).pipe(
  Effect.retry({ times: 2 }),
)
Effect.runPromise(r4).then(
  (x) => console.log("retry succeeded:", x),
  (e) => console.log("retry failed:", e.message),
)

// Test orElse
const r5 = Effect.fail(new Error("fail")).pipe(
  Effect.orElse(() => Effect.succeed("fallback")),
)
Effect.runPromise(r5).then((x) => console.log("orElse works:", x))

// Test orElseSucceed
const r6 = Effect.fail(new Error("fail")).pipe(
  Effect.orElseSucceed(() => "default"),
)
Effect.runPromise(r6).then((x) => console.log("orElseSucceed works:", x))

// Test either
const r7 = Effect.fail(new Error("fail")).pipe(Effect.either)
Effect.runPromise(r7).then((x) => console.log("either works:", x._tag, x._tag === "Left" ? x.left.message : x.right))

console.log("API test complete")

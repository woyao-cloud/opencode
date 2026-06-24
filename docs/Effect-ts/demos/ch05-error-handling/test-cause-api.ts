import { Effect, Cause, Exit, Fiber } from "effect"

// Check what's available in Cause
console.log("=== Cause API ===")
const causeKeys = Object.keys(Cause).filter(k => !k.startsWith("_"))
console.log(causeKeys.sort().join("\n"))

// Check Exit API
console.log("\n=== Exit API ===")
const exitKeys = Object.keys(Exit).filter(k => !k.startsWith("_"))
console.log(exitKeys.sort().join("\n"))

// Test Cause.fail
const failCause = Cause.fail(new Error("test"))
console.log("\nCause.fail:", failCause)
console.log("  _tag:", failCause._tag)
console.log("  typeof:", typeof failCause)

// Test if it's actually a Cause object
console.log("\nfailCause keys:", Object.keys(failCause))

// Test Cause.pretty
console.log("\nCause.pretty:", Cause.pretty(failCause))

// Test with Effect.exit
const program = Effect.fail(new Error("test")).pipe(Effect.exit)
Effect.runPromise(program).then((exit) => {
  console.log("\nExit:", exit)
  console.log("Exit._tag:", exit._tag)
  console.log("Exit keys:", Object.keys(exit))

  if (exit._tag === "Failure") {
    console.log("Failure cause:", exit.cause)
    console.log("Cause keys:", Object.keys(exit.cause))
    console.log("Cause._tag:", exit.cause._tag)
  }
})

// Check Fiber API
console.log("\n=== Fiber API ===")
const fiberKeys = Object.keys(Fiber).filter(k => !k.startsWith("_"))
console.log(fiberKeys.sort().join("\n"))

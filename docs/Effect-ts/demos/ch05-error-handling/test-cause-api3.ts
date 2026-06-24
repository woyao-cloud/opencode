import { Effect, Cause } from "effect"

// Check Effect.cause
console.log("Effect.cause:", typeof Effect.cause)

// Test Effect.cause
const program = Effect.fail(new Error("test")).pipe(Effect.cause)
Effect.runPromise(program).then((cause) => {
  console.log("Effect.cause result:", Cause.pretty(cause))
  console.log("hasFails:", Cause.hasFails(cause))
})

// Check Cause.isUnknownError
console.log("\nCause.isUnknownError:", typeof Cause.isUnknownError)

// Check if Cause.Done exists
console.log("\nCause.Done:", Cause.Done)
console.log("Cause.DoneTypeId:", Cause.DoneTypeId)

// Check isCause
console.log("\nCause.isCause:", typeof Cause.isCause)

// Check makeDieReason
console.log("\nCause.makeDieReason:", typeof Cause.makeDieReason)
console.log("Cause.makeFailReason:", typeof Cause.makeFailReason)
console.log("Cause.makeInterruptReason:", typeof Cause.makeInterruptReason)

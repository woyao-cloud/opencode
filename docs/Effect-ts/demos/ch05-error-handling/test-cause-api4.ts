import { Effect, Cause, Exit } from "effect"

// Check all Effect functions with "cause" in name
const causeFunctions = Object.keys(Effect).filter(k => k.toLowerCase().includes("cause"))
console.log("Effect *cause* functions:", causeFunctions)

// Check all Effect functions with "exit" in name
const exitFunctions = Object.keys(Effect).filter(k => k.toLowerCase().includes("exit"))
console.log("Effect *exit* functions:", exitFunctions)

// Check if Effect.catchCause exists
console.log("Effect.catchCause:", typeof Effect.catchCause)

// Check if Effect.catchCauseFilter exists
console.log("Effect.catchCauseFilter:", typeof Effect.catchCauseFilter)

// Check if Effect.catchCauseIf exists
console.log("Effect.catchCauseIf:", typeof Effect.catchCauseIf)

// Check Exit API again
console.log("\nExit.succeed:", typeof Exit.succeed)
console.log("Exit.fail:", typeof Exit.fail)
console.log("Exit.failCause:", typeof Exit.failCause)

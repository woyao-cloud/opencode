import { Cause } from "effect"

const failCause = Cause.fail(new Error("test"))
console.log("failCause:", failCause)
console.log("failCause keys:", Object.keys(failCause))
console.log("failCause reasons:", failCause.reasons)
console.log("reasons[0]:", failCause.reasons[0])
console.log("reasons[0]._tag:", failCause.reasons[0]._tag)
console.log("reasons[0].error:", failCause.reasons[0].error)

// findFail returns Result<Cause.Fail, ...>
const findResult = Cause.findFail(failCause)
console.log("\nfindFail result:", findResult)
console.log("findFail._tag:", findResult._tag)
console.log("findFail keys:", Object.keys(findResult))

// If it's a "Success" result, extract value
if (findResult._tag === "Success") {
  console.log("findFail.success:", (findResult as any).success)
  // Result uses 'success' key for Success variant
}

// Test with findDie
const dieCause = Cause.die(new Error("defect"))
console.log("\ndieCause:", dieCause)
const dieResult = Cause.findDie(dieCause)
console.log("findDie result._tag:", dieResult._tag)
if (dieResult._tag === "Success") {
  console.log("findDie.success._tag:", (dieResult as any).success._tag)
  console.log("findDie.success.defect:", (dieResult as any).success.defect?.message)
}

// Test hasFails with Die
console.log("\nhasFails(dieCause):", Cause.hasFails(dieCause))
console.log("hasDies(dieCause):", Cause.hasDies(dieCause))

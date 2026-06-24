import { Cause } from "effect"

// Check Cause constructors
console.log("=== Cause constructors ===")
console.log("fail:", typeof Cause.fail)
console.log("die:", typeof Cause.die)
console.log("interrupt:", typeof Cause.interrupt)
console.log("empty:", typeof Cause.empty)
console.log("combine:", typeof Cause.combine)
console.log("sequential:" in Cause, typeof (Cause as any).sequential)
console.log("parallel:" in Cause, typeof (Cause as any).parallel)

// Test find functions
const failCause = Cause.fail(new Error("test"))
console.log("\n=== find functions ===")
console.log("findFail:", Cause.findFail(failCause))
console.log("findDie:", Cause.findDie(failCause))
console.log("findError:", Cause.findError(failCause))
console.log("findErrorOption:", Cause.findErrorOption(failCause))

// Test isReason functions
const failReason = Cause.findFail(failCause)
console.log("\n=== isReason functions ===")
console.log("failReason:", failReason)
console.log("failReason._tag:", failReason._tag)
console.log("isFailReason:", Cause.isFailReason(failReason))
console.log("isDieReason:", Cause.isDieReason(failReason))
console.log("isInterruptReason:", Cause.isInterruptReason(failReason))

// Test has functions
console.log("\n=== has functions ===")
console.log("hasFails:", Cause.hasFails(failCause))
console.log("hasDies:", Cause.hasDies(failCause))
console.log("hasInterrupts:", Cause.hasInterrupts(failCause))

// Test interrupt
const intCause = Cause.interrupt("test-fiber-id")
console.log("\n=== interrupt cause ===")
console.log("intCause:", Cause.pretty(intCause))
console.log("hasInterrupts:", Cause.hasInterrupts(intCause))
console.log("hasInterruptsOnly:", Cause.hasInterruptsOnly(intCause))

// Test squash
console.log("\n=== squash ===")
const squashed = Cause.squash(failCause)
console.log("squashed:", squashed)

// Test combine
const c1 = Cause.fail(new Error("error 1"))
const c2 = Cause.fail(new Error("error 2"))
const combined = Cause.combine(c1, c2)
console.log("\n=== combine ===")
console.log("combined:", Cause.pretty(combined))
console.log("combined failures count:", combined.reasons?.length ?? "N/A")

// Test done
console.log("\n=== done ===")
console.log("isDone:", Cause.isDone(Cause.done))
console.log("isDone on fail:", Cause.isDone(failCause))

// Check Cause reasons structure
console.log("\n=== Cause structure ===")
console.log("failCause keys:", Object.keys(failCause))
console.log("failCause[~effect/Cause]:", (failCause as any)["~effect/Cause"])
console.log("failCause.reasons:", failCause.reasons)

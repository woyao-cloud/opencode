import { Schedule, Duration } from "effect"

// Check Schedule API
const scheduleKeys = Object.keys(Schedule).filter(k => !k.startsWith("_"))
console.log("Schedule keys:", scheduleKeys.sort().join(", "))

// Check for compose alternatives
console.log("\nandThen in Schedule:", "andThen" in Schedule)
console.log("pipe in Schedule:", "pipe" in Schedule)
console.log("compose in Schedule:", "compose" in Schedule)
console.log("intersect in Schedule:", "intersect" in Schedule)
console.log("union in Schedule:", "union" in Schedule)

// Test exponential with recurs via pipe
const s = Schedule.exponential(Duration.millis(100)).pipe(
  Schedule.andThen?.(Schedule.recurs(3)),
)
console.log("\nSchedule.exponential + andThen + recurs:", s ? "works" : "null")

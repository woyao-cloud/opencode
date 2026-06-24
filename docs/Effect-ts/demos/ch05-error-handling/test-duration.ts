import { Duration, Schedule } from "effect"

// Check Duration API
console.log("Duration keys:", Object.keys(Duration).filter(k => !k.startsWith("_")).slice(0, 20))

// Try creating durations
console.log("\nDuration.millis(100):", Duration.millis(100))
console.log("Duration.seconds(1):", Duration.seconds(1))

// Test Schedule.exponential with Duration
try {
  const s = Schedule.exponential(Duration.millis(100))
  console.log("Schedule.exponential works with Duration.millis(100)")
} catch (e) {
  console.log("Schedule.exponential error:", (e as Error).message)
}

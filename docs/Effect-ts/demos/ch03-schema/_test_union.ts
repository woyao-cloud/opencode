import { Schema } from "effect"

// Test Union calling convention
console.log("typeof Union:", typeof Schema.Union)

const A = Schema.TaggedStruct("A", { value: Schema.String })
const B = Schema.TaggedStruct("B", { count: Schema.Number })

// Try different patterns
console.log("\n=== Pattern: Union(member1, member2) ===")
try {
  const u = Schema.Union(A, B)
  console.log("OK:", typeof u)
} catch(e) { console.log("FAIL:", (e as Error).message) }

console.log("\n=== Pattern: Union([member1, member2]) ===")
try {
  const u = Schema.Union([A, B])
  console.log("OK:", typeof u)
} catch(e) { console.log("FAIL:", (e as Error).message) }

console.log("\n=== Pattern: Union({members: [member1, member2]}) ===")
try {
  const u = (Schema as any).Union({ members: [A, B] })
  console.log("OK:", typeof u)
} catch(e) { console.log("FAIL:", (e as Error).message) }

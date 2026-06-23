import { Schema } from "effect"

// Test TaggedStruct with and without _tag in input
const OrderCreated = Schema.TaggedStruct("OrderCreated", {
  orderId: Schema.String,
  amount: Schema.Number,
})

// Test: does it need _tag in input?
console.log("=== Test without _tag ===")
try {
  const r = Schema.decodeUnknownSync(OrderCreated)({ orderId: "1", amount: 10 })
  console.log("without _tag: OK", r._tag)
} catch(e) { console.log("without _tag: FAIL -", (e as Error).message) }

console.log("\n=== Test with _tag ===")
try {
  const r = Schema.decodeUnknownSync(OrderCreated)({ _tag: "OrderCreated", orderId: "1", amount: 10 })
  console.log("with _tag: OK", r._tag)
} catch(e) { console.log("with _tag: FAIL -", (e as Error).message) }

// Check what the struct looks like
console.log("\n=== Schema structure ===")
console.log("OrderCreated:", OrderCreated)

import { Schema } from "effect"

// Test TaggedStruct calling convention
console.log("typeof TaggedStruct:", typeof Schema.TaggedStruct)

// Try different calling patterns
try {
  // Pattern 1: TaggedStruct(tag)(fields)
  const s1 = Schema.TaggedStruct("OrderCreated")({
    orderId: Schema.String,
    amount: Schema.Number,
  })
  console.log("Pattern 1 (tag)(fields): OK", Schema.decodeUnknownSync(s1)({ orderId: "1", amount: 10 }))
} catch(e) { console.log("Pattern 1 fails:", (e as Error).message) }

try {
  // Pattern 2: TaggedStruct({...}) with _tag in fields
  const s2 = Schema.TaggedStruct({
    _tag: Schema.Literal("OrderCreated"),
    orderId: Schema.String,
    amount: Schema.Number,
  })
  console.log("Pattern 2 (object): OK")
} catch(e) { console.log("Pattern 2 fails:", (e as Error).message) }

try {
  // Pattern 3: TaggedStruct(tag, fields)
  const s3 = Schema.TaggedStruct("OrderCreated", {
    orderId: Schema.String,
    amount: Schema.Number,
  })
  console.log("Pattern 3 (tag, fields): OK")
} catch(e) { console.log("Pattern 3 fails:", (e as Error).message) }

// Check the TaggedStruct function signature
console.log("\nTaggedStruct.toString:", Schema.TaggedStruct.toString().slice(0, 200))

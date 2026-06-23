import { Schema } from "effect"

// Test TaggedErrorClass patterns
console.log("=== TaggedErrorClass tests ===")

try {
  class MyError extends Schema.TaggedErrorClass<MyError>()("MyError")({
    message: Schema.String,
  }) {}

  // Try different instantiation patterns
  console.log("Class defined OK")

  // Try with new
  try {
    const e1 = new MyError({ message: "test1" })
    console.log("new works:", e1._tag)
  } catch(e) { console.log("new fails:", (e as Error).message) }

  // Try with .make
  try {
    const e2 = (MyError as any).make({ message: "test2" })
    console.log(".make works:", e2._tag)
  } catch(e) { console.log(".make fails:", (e as Error).message) }

  // Try without new (like a function call)
  try {
    const e3 = (MyError as any)({ message: "test3" })
    console.log("call works:", e3._tag)
  } catch(e) { console.log("call fails:", (e as Error).message) }

} catch(e) { console.log("Class definition fails:", (e as Error).message) }

// Also test ErrorClass
console.log("\n=== ErrorClass tests ===")
try {
  class MyError2 extends Schema.ErrorClass<MyError2>()("MyError2")({
    message: Schema.String,
  }) {}

  console.log("ErrorClass defined OK")
  try {
    const e = new MyError2({ message: "test" })
    console.log("new works:", e._tag)
  } catch(e) { console.log("new fails:", (e as Error).message) }

} catch(e) { console.log("ErrorClass definition fails:", (e as Error).message) }

// Check if ErrorClass exists
console.log("\nErrorClass:", "ErrorClass" in Schema ? "OK" : "MISSING")

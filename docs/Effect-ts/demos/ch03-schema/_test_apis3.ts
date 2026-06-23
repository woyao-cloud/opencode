import * as Effect from "effect"
import { Schema } from "effect"

// Dump all Schema keys to find constraint/filter APIs
const keys = Object.keys(Schema).sort()
console.log("=== All Schema keys ===")
for (const k of keys) {
  console.log("  " + k)
}

// Check Schema.Number.pipe-able filters
console.log("\n=== Check Number pipe ===")
const numProto = Object.getOwnPropertyNames(Object.getPrototypeOf(Schema.Number))
console.log("Number prototype:", numProto)

// Check if there's a filter/check approach
console.log("\n=== Check for filter/check/refine ===")
for (const name of ["filter", "check", "refine", "validate", "constraint"]) {
  console.log(name + ": " + (name in Schema ? "OK" : "MISSING"))
}

// Check if pipe with custom filter works
console.log("\n=== Test Schema.Number filter ===")
try {
  const Positive = Schema.Number.pipe(
    (Schema as any).filter((n: number) => n > 0, { message: () => "must be positive" })
  )
  console.log("filter: OK")
} catch(e) { console.log("filter: FAIL -", (e as Error).message) }

// Try Schema.compose
console.log("\n=== Check transform/compose ===")
try {
  // Try creating a transform via pipe
  const s = Schema.Number.pipe(
    Schema.typeSchema, // maybe?
    Schema.compose?.(Schema.String)
  )
  console.log("compose: OK")
} catch(e) { console.log("compose: FAIL -", (e as Error).message) }

// Check for Schema.annotations
console.log("\n=== Schema.annotations ===")
console.log("annotations:", typeof (Schema as any).annotations)

// Check what Schema.TaggedClass constructor needs
console.log("\n=== TaggedClass details ===")
try {
  class Foo extends Schema.TaggedClass<Foo>()("Foo")({ name: Schema.String }) {
    static make = (input: { name: string }) => new Foo(input)
  }
  console.log("TaggedClass with make: OK", Foo.make({ name: "test" })._tag)
} catch(e) { console.log("TaggedClass with make: FAIL -", (e as Error).message) }

// Check TaggedErrorClass
console.log("\n=== TaggedErrorClass ===")
try {
  class MyError extends Schema.TaggedErrorClass<MyError>()("MyError")({
    message: Schema.String,
  }) {}
  console.log("TaggedErrorClass: OK", new MyError({ message: "test" })._tag)
} catch(e) { console.log("TaggedErrorClass: FAIL -", (e as Error).message) }

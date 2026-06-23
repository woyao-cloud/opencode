import { Schema } from "effect"

// Test number constraints
console.log("=== Number constraints ===")
try {
  const s = Schema.Number.pipe(Schema.greaterThan(0))
  console.log("Schema.Number.pipe(Schema.greaterThan(0)): OK")
} catch(e) { console.log("Schema.Number.pipe(greaterThan): FAIL -", (e as Error).message) }

try {
  const s = Schema.Number.pipe(Schema.greaterThanOrEqualTo(0))
  console.log("Schema.Number.pipe(greaterThanOrEqualTo): OK")
} catch(e) { console.log("Schema.Number.pipe(greaterThanOrEqualTo): FAIL -", (e as Error).message) }

// Check for GreaterThan as direct export
console.log("Schema.greaterThan:", typeof (Schema as any).greaterThan)
console.log("Schema.greaterThanOrEqualTo:", typeof (Schema as any).greaterThanOrEqualTo)
console.log("Schema.minLength:", typeof (Schema as any).minLength)
console.log("Schema.maxLength:", typeof (Schema as any).maxLength)

// Test TaggedClass
console.log("\n=== TaggedClass ===")
try {
  class Foo extends Schema.TaggedClass<Foo>()("Foo")({ name: Schema.String }) {}
  console.log("TaggedClass: OK", new Foo({ name: "test" })._tag)
} catch(e) { console.log("TaggedClass: FAIL -", (e as Error).message) }

// Check other error-related APIs
console.log("\n=== Error APIs ===")
for (const name of ["TaggedError", "TaggedRequest", "TaggedErrorClass"]) {
  console.log(name + ": " + (name in Schema ? "OK" : "MISSING"))
}

// Test decodeUnknown variants
console.log("\n=== Decode APIs ===")
for (const name of ["decodeUnknown", "decodeUnknownEither", "decodeUnknownSync", "decodeEither", "decodeOption", "decodeUnknownOption"]) {
  console.log(name + ": " + (name in Schema ? "OK" : "MISSING"))
}

// Test transform
console.log("\n=== Transform APIs ===")
for (const name of ["transform", "transformOrFail", "transformEither"]) {
  console.log(name + ": " + (name in Schema ? "OK" : "MISSING"))
}

// Test standard schema
console.log("\n=== Standard Schema ===")
console.log("Schema.standardSchemaV1:", typeof (Schema as any).standardSchemaV1)

// Test pipe-based approaches
console.log("\n=== Pipe-based ===")
try {
  const s = Schema.Struct({ name: Schema.String }).pipe(Schema.brand("MyBrand"))
  console.log("brand pipe: OK")
} catch(e) { console.log("brand pipe: FAIL -", (e as Error).message) }

// Check Schema.Schema namespace
console.log("\n=== Schema.Schema ===")
console.log("typeof Schema.Schema:", typeof Schema.Schema)
if (typeof Schema.Schema === "object" && Schema.Schema !== null) {
  for (const name of Object.keys(Schema.Schema as object).slice(0, 20)) {
    console.log("  Schema.Schema." + name)
  }
}

import { Schema } from "effect"

// Test if Schema.Class-based errors work (manual _tag approach)
console.log("=== Manual tag approach ===")

// Instead of TaggedErrorClass, use Schema.Class with explicit _tag
class ValidationError extends Schema.Class<ValidationError>("ValidationError")({
  _tag: Schema.Literal("ValidationError"),
  message: Schema.String,
  field: Schema.optional(Schema.String),
  value: Schema.optional(Schema.Unknown),
}) {
  get description(): string {
    return `[${this._tag}] ${this.message}`
  }

  static forField(field: string, message: string, value?: unknown): ValidationError {
    return new ValidationError({ _tag: "ValidationError", message, field, value })
  }
}

try {
  const e = ValidationError.forField("email", "格式错误")
  console.log("ValidationError with Class:", e._tag, e.description)
} catch(e) { console.log("ValidationError fails:", (e as Error).message) }

// Test ErrorClass
console.log("\n=== ErrorClass ===")
try {
  class MyErr extends Schema.ErrorClass<MyErr>()("MyErr")({
    message: Schema.String,
  }) {}
  console.log("ErrorClass defined OK")
  const e = new MyErr({ message: "test" })
  console.log("ErrorClass instance:", e.message)
} catch(e) { console.log("ErrorClass fails:", (e as Error).message) }

// Check what ErrorClass actually provides
console.log("\n=== ErrorClass prototype check ===")
import * as Effect from "effect"
// Create a simple error class and inspect
class SimpleErr extends Schema.Class<SimpleErr>("SimpleErr")({
  message: Schema.String,
  code: Schema.Number,
}) {
  get isError(): boolean { return true }
}

const se = new SimpleErr({ message: "test", code: 500 })
console.log("SimpleErr _tag:", (se as any)._tag)
console.log("SimpleErr instanceof Error:", se instanceof Error)

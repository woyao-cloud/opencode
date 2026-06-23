import { Schema } from "effect"

const apis = [
  "Struct", "String", "Number", "Boolean", "Literal", "optional",
  "Array", "Record", "GreaterThan", "GreaterThanOrEqualTo",
  "decodeSync", "decodeUnknownSync",
  "Class", "TaggedClass", "TaggedError", "TaggedStruct",
  "encode", "encodeSync", "decode", "decodeUnknown",
  "transform", "standardSchemaV1", "tag", "Unknown", "Defect",
  "Union", "to", "compose", "Brand", "from", "typeSchema"
]

for (const name of apis) {
  const exists = name in Schema
  console.log(name + ": " + (exists ? "OK" : "MISSING"))
}

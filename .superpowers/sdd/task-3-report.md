# Task 3 Report: Chapter 3 - Schema Runtime Type Safety

## Status: DONE

## Commit
- `4637512a` — workwell-miniopencode (includes all chapter 3 files)

## Files Created/Modified
- `docs/Effect-ts/chapter-03-schema.md` — 717 lines, seven-section structure
- `docs/Effect-ts/demos/ch03-schema/package.json` — effect 4.0.0-beta.65
- `docs/Effect-ts/demos/ch03-schema/README.md` — demo index
- `docs/Effect-ts/demos/ch03-schema/src/01-basic-struct.ts` — Schema.Struct, optional, Literal, Array, Record, check + is* constraints, error info
- `docs/Effect-ts/demos/ch03-schema/src/02-class-and-tag.ts` — Schema.Class, tagged error pattern, TaggedStruct, toTaggedUnion, OpenCode Usage pattern
- `docs/Effect-ts/demos/ch03-schema/src/03-encode-decode.ts` — decodeUnknownSync/Effect, encodeUnknownSync/Effect, JSON round-trip, Option-based validation, data cleaning
- `docs/Effect-ts/demos/ch03-schema/src/04-type-inference.ts` — typeof .Type/.Encoded, NumberFromString, toStandardSchemaV1, single source of truth pattern

## Test Results
All 4 demos pass:
- `01-basic-struct.ts` — Struct definition, optional fields, literal constraints, check + isGreaterThan, error propagation
- `02-class-and-tag.ts` — Class with getters/factory, tagged errors, TaggedStruct, toTaggedUnion, Class vs plain class comparison
- `03-encode-decode.ts` — encode/decode round-trip, Effect integration, Option validation, data cleaning pipeline
- `04-type-inference.ts` — .Type vs .Encoded derivation, NumberFromString transform, Standard Schema V1, single source of truth

## API Corrections Made (beta.65)

1. **Schema.GreaterThan() does NOT exist** → use `Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0)))`. All numeric constraints use the `Schema.check(Schema.is*(...))` pattern.
2. **Schema.TaggedErrorClass broken in Bun** → `Cannot call a class constructor without |new|`. Used `Schema.Class` + explicit `_tag: Schema.Literal("...")` field pattern instead, which matches the OpenCode `Usage` class approach.
3. **Schema.TaggedStruct(tag)(fields) does NOT work** → use `Schema.TaggedStruct(tagString, fieldsObject)` (two-argument form). The one-argument curried form `Schema.TaggedStruct(tag)(fields)` is not a function.
4. **Schema.Union(member1, member2) does NOT work** → use `Schema.Union([member1, member2])` (array form).
5. **Schema.decode/encode fail on plain Struct** → `ast.encoding` is undefined for schemas without transforms. Use `decodeUnknown*`/`encodeUnknown*` series for plain Structs.
6. **Schema.toStandardSchemaV1 returns wrapper object** → the standard interface is at `.~standard` property (version, vendor, validate), not directly on the returned object.

## Concerns
- The `Schema.TaggedErrorClass` constructor issue in Bun beta.65 may be resolved in future beta versions. The current workaround (Schema.Class + explicit _tag) is functionally equivalent.
- `Schema.decode`/`Schema.encode` only work on schemas with encoding transforms. This is a design choice in beta.65 that may change.

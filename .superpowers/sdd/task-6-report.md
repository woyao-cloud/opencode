# Task 6 Report: 第 6 章 -- Scope 资源生命周期管理

## Status: Complete

## Commits

- `027f4184b` -- refactory (initial commit: chapter + demos)
- `7d09f9de1` -- docs: Effect-TS book chapter 6 - Scope (fix: Scope.fork+Scope.use, Effect.exit for beta.65)

## Files Created

| File | Description |
|------|-------------|
| `docs/Effect-ts/chapter-06-scope.md` | Seven-section chapter: overview, core concepts, acquireRelease, Scope.fork, addFinalizer, file handle demo, summary |
| `docs/Effect-ts/demos/ch06-scope/package.json` | Package config with effect 4.0.0-beta.65 |
| `docs/Effect-ts/demos/ch06-scope/README.md` | Demo directory readme with run instructions |
| `docs/Effect-ts/demos/ch06-scope/src/01-acquire-release.ts` | acquireRelease: normal/error/parallel scenarios (3 scenes) |
| `docs/Effect-ts/demos/ch06-scope/src/02-scope-fork.ts` | Scope.fork+Scope.use: isolation/error isolation/nested (3 scenes) |
| `docs/Effect-ts/demos/ch06-scope/src/03-finalizer.ts` | addFinalizer(exit=>): LIFO order/temp files/error/combo (4 scenes) |
| `docs/Effect-ts/demos/ch06-scope/src/04-file-handle-demo.ts` | File handle management: basic/error/parallel/sub-scope (4 scenes, real fs) |

## Test Results

All 4 demos pass with verified output:

- **01-acquire-release.ts**: 3 scenarios pass -- normal query, error with release, parallel connections with LIFO release
- **02-scope-fork.ts**: 3 scenarios pass -- independent lifecycle, error isolation, nested scopes
- **03-finalizer.ts**: 4 scenarios pass -- LIFO order, temp file cleanup, error scenario, acquireRelease combo
- **04-file-handle-demo.ts**: 4 scenarios pass -- basic R/W, error handling, parallel multi-file, sub-scope isolation

## API Corrections (Effect 4.0.0-beta.65)

Verified against `.d.ts` files in `node_modules/effect/dist/`. Several APIs differ from what the task brief assumed:

| API | Brief Assumed | Actual (beta.65) | Status |
|-----|--------------|-------------------|--------|
| `Scope.fork` | `Scope.fork(effect)` -- implicit scope from context | `Scope.fork(scope: Scope, strategy?): Effect<Closeable>` -- explicit scope param | **CORRECTED** |
| `Scope.use` | Not mentioned | `Scope.use(closeable: Closeable)(effect): Effect<...>` -- needed to run in child scope | **ADDED** |
| `Effect.addFinalizer` | `() => Effect` -- no arg | `(exit: Exit.Exit<unknown, unknown>) => Effect<void, never, R>` -- receives exit | **CORRECTED** |
| `Effect.either` | `Effect.either(effect)` | Does not exist in beta.65 | **REPLACED** with `Effect.exit` + `Exit.match` |
| `Effect.acquireRelease` | `(acquire, release)` | `(acquire, release, options?)` -- matches brief | OK |
| `Effect.scoped` | `(effect) => Effect` | `(self) => Effect<..., Exclude<R, Scope>>` -- matches brief | OK |

### Corrected API patterns

```typescript
// Scope.fork -- two-step API
const scope = yield* Scope.Scope
const childScope = yield* Scope.fork(scope)
yield* Scope.use(childScope)(Effect.gen(function* () { ... }))

// Effect.addFinalizer -- receives exit
yield* Effect.addFinalizer((exit) => Effect.sync(() => cleanup(exit)))

// Effect.exit + Exit.match -- replaces Effect.either
const childExit = yield* Effect.exit(effect)
const msg = Exit.match(childExit, {
  onSuccess: () => "ok",
  onFailure: (_cause) => "failed",
})
```

## Concerns

None. All APIs verified and all demos run correctly.

## Report Path

`.superpowers/sdd/task-6-report.md`

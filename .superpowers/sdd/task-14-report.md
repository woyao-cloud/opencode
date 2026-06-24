# Task 14 Report: Chapter 14 — Advanced Concurrency Primitives

## Status: Complete

## Files Created

| File | Description |
|------|-------------|
| `docs/Effect-ts/chapter-14-advanced-concurrency.md` | Chapter markdown with Chinese commentary (9 sections) |
| `docs/Effect-ts/demos/ch14-advanced-concurrency/package.json` | Package config (effect 4.0.0-beta.65, 5 scripts) |
| `docs/Effect-ts/demos/ch14-advanced-concurrency/README.md` | Demo README with install/run/file descriptions |
| `docs/Effect-ts/demos/ch14-advanced-concurrency/src/01-synchronized-ref.ts` | SynchronizedRef: make/get/set/update/modify/concurrent safety |
| `docs/Effect-ts/demos/ch14-advanced-concurrency/src/02-latch.ts` | Latch: make/open/close/await/release/whenOpen/graceful shutdown |
| `docs/Effect-ts/demos/ch14-advanced-concurrency/src/03-fiber-map.ts` | FiberMap: make/run/set/get/remove/awaitEmpty/join/Scope cleanup |
| `docs/Effect-ts/demos/ch14-advanced-concurrency/src/04-scoped-cache.ts` | ScopedCache: make/get/set/refresh/invalidate/TTL/API cache |
| `docs/Effect-ts/demos/ch14-advanced-concurrency/src/05-pubsub.ts` | PubSub: bounded/publish/subscribe/take/strategies/broadcast |

## Verification

All 5 demos exit cleanly without runtime errors. API usage verified against:
- `node_modules/effect/dist/SynchronizedRef.d.ts` — confirmed `make`, `get`, `set`, `update`, `updateAndGet`, `getAndUpdate`, `modify`, `modifyEffect`, `getAndSet`, `setAndGet`, `getUnsafe`
- `node_modules/effect/dist/Latch.d.ts` — confirmed `make`, `open`, `close`, `await`, `release`, `whenOpen`, `makeUnsafe`, `openUnsafe`, `closeUnsafe`
- `node_modules/effect/dist/FiberMap.d.ts` — confirmed `make`, `set`, `get`, `remove`, `clear`, `run`, `size`, `join`, `awaitEmpty`, `makeRuntime`, `has`, `getUnsafe`, `hasUnsafe`, `setUnsafe`
- `node_modules/effect/dist/ScopedCache.d.ts` — confirmed `make`, `get`, `set`, `has`, `refresh`, `invalidate`, `invalidateAll`, `size`, `keys`, `values`, `entries`, `makeWith`, `getOption`, `getSuccess`, `invalidateWhen`
- `node_modules/effect/dist/PubSub.d.ts` — confirmed `bounded`, `unbounded`, `sliding`, `dropping`, `publish`, `subscribe`, `take`, `takeAll`, `takeUpTo`, `takeBetween`, `size`, `capacity`, `isFull`, `isEmpty`, `shutdown`

## API Adaptations

- `Effect.fork` → `Effect.forkDetach` (Effect 4.0.0-beta.65 has no `Effect.fork`; uses `forkChild`, `forkDetach`, `forkIn`, `forkScoped`)
- `Fiber.join` used instead of `Fiber.await` (which returns `Exit` instead of the value)
- `Effect.timeoutOption` used instead of `Effect.timeout` (timeout throws `TimeoutError`; `timeoutOption` returns `Option`)

## OpenCode Reference

- `packages/opencode/src/control-plane/workspace.ts` — imports `FiberMap` for workspace sync fiber management

## Commit

```
docs: Effect-TS book chapter 14 - Advanced Concurrency
```

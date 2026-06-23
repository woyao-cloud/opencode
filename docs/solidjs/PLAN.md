# SolidJS for React Developers: A Practical Guide Using OpenCode

## Implementation Plan

---

## Overview

This plan describes how to create a comprehensive Chinese-language book about SolidJS for React developers, using the OpenCode project as a real-world case study. The book will be saved as markdown files under `docs/solidjs/`.

**Target audience**: React developers with 1+ years of experience who want to learn SolidJS.

**Teaching approach**: Problem-driven. For each concept, we first show the React way and its pain points, then introduce SolidJS's solution with real OpenCode code.

---

## File Structure

```
docs/solidjs/
├── README.md                          # Book index, table of contents, navigation
├── docker-compose.yml                 # Development environment setup
├── 01-introduction.md                 # Why SolidJS? Problem statement
├── 02-how-solid-works.md             # Implementation principles (compiler + reactivity)
├── 03-signals-and-memos.md           # createSignal, createMemo, derived state
├── 04-effects-and-lifecycle.md       # createEffect, onCleanup, onMount, lifecycle
├── 05-control-flow.md                # Show, For, Index, Switch/Match, Suspense, ErrorBoundary, Dynamic
├── 06-stores-and-state-management.md # createStore, produce, reconcile, batch, context
├── 07-components-and-props.md        # Components, splitProps, children, Dynamic, lazy
├── 08-routing-and-navigation.md       # @solidjs/router, nested routes, params
├── 09-async-and-server-state.md      # createResource, Suspense, @tanstack/solid-query
├── 10-ecosystem-and-tooling.md       # Kobalte, solid-primitives, Vite, Tailwind, testing
├── 11-ssr-and-ssg.md                 # Astro + SolidJS islands, hydration
├── 12-optimization-guide.md          # Memoization, batch, reconcile, avoiding over-reactivity
├── 13-common-patterns.md             # Forms, animations, refs, interop, drag-and-drop
├── 14-migration-guide.md             # React-to-SolidJS cheat sheet, mental model shift
├── 15-risks-and-pitfalls.md          # Memory leaks, over-reactivity, ecosystem gaps
└── appendix-cheatsheet.md            # React pattern -> SolidJS pattern quick reference
```

---

## Chapter-by-Chapter Design

### Chapter 1: Introduction - Why SolidJS? (01-introduction.md)

**Purpose**: Establish the "why" before the "how". Show React developers what problems SolidJS solves.

**Sections**:
1. The Virtual DOM tax - Why React re-renders are fundamentally wasteful
2. Fine-grained reactivity explained - Signals as the primitive, not components
3. No stale closures - How SolidJS eliminates the `useEffect` dependency array problem
4. No dependency arrays - `createMemo` and `createEffect` track dependencies automatically
5. Isomorphic control flow - `Show`, `For`, `Switch` are just components, no special rules
6. True reactivity - Computations re-run when signals change, not when parent re-renders
7. Bundle size and performance - SolidJS is ~7KB gzipped, no virtual DOM overhead

**OpenCode examples**:
- `packages/app/src/app.tsx` - Show the top-level component tree with `Show`, `For`, `Suspense`, `ErrorBoundary`
- `packages/app/src/context/settings.tsx` - Show `createStore` with `createEffect` for side effects
- `packages/app/src/context/server.tsx` - Show `createMemo` for derived state, `createEffect` with `onCleanup`

**Key insight to convey**: In React, components re-render. In SolidJS, only the specific DOM nodes that depend on changed signals update. This is the fundamental mental model shift.

---

### Chapter 2: How SolidJS Works Under the Hood (02-how-solid-works.md)

**Purpose**: Explain the compiler + reactive runtime architecture so developers understand why SolidJS behaves the way it does.

**Sections**:
1. The SolidJS compiler - How JSX is compiled into real DOM operations
2. Signal graph - How signals, memos, and effects form a dependency graph
3. Observer pattern - How SolidJS tracks which computations depend on which signals
4. Synchronous execution - Why effects run immediately, not in a microtask
5. No dirty checking - How SolidJS knows exactly what changed without diffing
6. The `$PX` marker - How the compiler marks reactive expressions
7. Batching with `batch` - How to group signal updates to avoid intermediate computations

**OpenCode examples**:
- `packages/app/src/context/server.tsx` (lines 143-145) - `createMemo` with `resolveServerList` showing automatic dependency tracking
- `packages/app/src/context/settings.tsx` (lines 149-151) - `withFallback` using `createMemo` for derived state
- `packages/app/src/context/server.tsx` (lines 187-197) - `batch()` usage for atomic store updates

**Key insight to convey**: SolidJS's compiler transforms your JSX into direct DOM manipulation calls. There is no virtual DOM, no diffing, no reconciliation. The reactive system is the "diff" - it knows exactly which DOM nodes to update.

---

### Chapter 3: Signals and Memos (03-signals-and-memos.md)

**Purpose**: Deep dive into the most fundamental SolidJS primitives.

**Sections**:
1. `createSignal` - The atomic unit of reactive state
2. Signal getters vs setters - Why SolidJS uses function calls, not `.value`
3. `createMemo` - Derived state that caches and lazily evaluates
4. Automatic dependency tracking - How SolidJS knows when to re-compute
5. Custom `equals` - When to provide custom equality functions
6. `on` helper - Explicit dependency specification
7. `untrack` - Reading signals without creating dependencies

**OpenCode examples**:
- `packages/app/src/pages/session/message-timeline.tsx` (lines 132-208) - `createTimelineStaging` with `createStore` and `createMemo`
- `packages/app/src/pages/session/message-timeline.tsx` (lines 267-271) - `createMemo` with previous value tracking
- `packages/app/src/context/settings.tsx` (lines 149-151) - `withFallback` pattern using `createMemo`
- `packages/app/src/context/server.tsx` (lines 228-234) - `createMemo` for `current` and `isLocal`

**React comparison table**:
| React | SolidJS |
|-------|---------|
| `useState` | `createSignal` |
| `useMemo` | `createMemo` |
| `useCallback` | Not needed (functions are stable) |
| `useRef` | `createSignal` or plain variable |

---

### Chapter 4: Effects and Lifecycle (04-effects-and-lifecycle.md)

**Purpose**: Teach the SolidJS effect system and component lifecycle, which differs significantly from React.

**Sections**:
1. `createEffect` - The side effect primitive (runs synchronously, tracks dependencies)
2. `onCleanup` - Cleanup function (runs on disposal, not on re-run)
3. `onMount` - Run once on mount (wraps `createEffect` with `onCleanup`)
4. Effect lifecycle - How effects are created, tracked, and disposed
5. Effect batching - How SolidJS batches effect runs
6. `createRoot` - Manual disposal boundaries
7. Comparison with `useEffect` - No dependency array, no cleanup timing confusion

**OpenCode examples**:
- `packages/app/src/context/server.tsx` (lines 214-224) - `createEffect` with `onCleanup` for health polling
- `packages/app/src/pages/session/message-timeline.tsx` (lines 273-278) - `createEffect` with timer cleanup
- `packages/app/src/pages/session/message-timeline.tsx` (lines 435-448) - `createEffect` with `on(sessionKey, ...)` for explicit deps
- `packages/app/src/pages/session/composer/session-composer-region.tsx` (lines 99-117) - `createEffect` with `requestAnimationFrame` and timer cleanup
- `packages/app/src/pages/session/file-tabs.tsx` (lines 153-155) - `createEffect` with `makeEventListener` for scroll sync

**Key insight to convey**: In React, `useEffect` runs after render. In SolidJS, `createEffect` runs synchronously when its dependencies change. There is no "render phase" vs "effect phase" - effects are just another reactive computation.

---

### Chapter 5: Control Flow (05-control-flow.md)

**Purpose**: Show how SolidJS's control flow components replace React's conditional rendering and array mapping.

**Sections**:
1. `Show` - Conditional rendering (replaces ternary `&&` and ternary `? :`)
2. `For` - Array iteration with keyed updates (replaces `array.map()`)
3. `Index` - Array iteration by index (for non-keyed lists)
4. `Switch`/`Match` - Multi-branch conditional (replaces `switch` or nested ternaries)
5. `Suspense` - Loading states for async resources
6. `ErrorBoundary` - Error handling boundary
7. `Dynamic` - Dynamic component rendering
8. Why control flow components exist - No virtual DOM means no reconciliation, so SolidJS needs explicit control flow

**OpenCode examples**:
- `packages/app/src/app.tsx` (lines 200-236) - `Suspense` with `Show` for connection gate
- `packages/app/src/app.tsx` (lines 261-280) - `Show` with `For` for server list
- `packages/app/src/pages/session/message-timeline.tsx` (lines 1024-1111) - `For` with nested `Show`, `Index`, `Dynamic`
- `packages/app/src/pages/session/file-tabs.tsx` (lines 446-452) - `Switch`/`Match` for file loading states
- `packages/app/src/pages/session/composer/session-composer-region.tsx` (lines 153-290) - Nested `Show` with `keyed` prop

**React comparison**:
| React | SolidJS |
|-------|---------|
| `{condition && <Component/>}` | `<Show when={condition}><Component/></Show>` |
| `{array.map(item => <Item/>)}` | `<For each={array}>{(item) => <Item/>}</For>` |
| `{array.map((_, i) => ...)}` | `<Index each={array}>{(item, i) => ...}</Index>` |
| `switch/case` | `<Switch><Match when={cond}>...</Match></Switch>` |
| `React.Suspense` | `<Suspense fallback={...}>...</Suspense>` |
| `ErrorBoundary` | `<ErrorBoundary fallback={...}>...</ErrorBoundary>` |

---

### Chapter 6: Stores and State Management (06-stores-and-state-management.md)

**Purpose**: Cover SolidJS's store system for complex nested state, which replaces React's `useReducer` and Context.

**Sections**:
1. `createStore` - Deeply reactive store for complex state
2. Store setters - Path syntax for nested updates
3. `produce` - Immer-like mutable syntax for complex updates
4. `reconcile` - Efficient diff-based updates for large data sets
5. `batch` - Grouping multiple store updates into one notification
6. Context patterns - `createSimpleContext` (custom utility) vs `createContext`
7. Persisted state - `makePersisted` from `@solid-primitives/storage`
8. Comparison with React state management

**OpenCode examples**:
- `packages/app/src/context/settings.tsx` (lines 153-332) - Full `createStore` with `persisted` and `createSimpleContext`
- `packages/app/src/context/server.tsx` (lines 132-312) - `createStore` with `batch`, `produce`, `reconcile`
- `packages/app/src/context/layout.tsx` (lines 230-941) - Complex `createStore` with `produce`, migration, persistence
- `packages/app/src/pages/session/message-timeline.tsx` (lines 132-208) - `createStore` for staging state
- `packages/app/src/utils/persist.ts` - Custom persistence layer using `makePersisted`
- `packages/app/src/context/sync.tsx` - `createStore` with `produce` and `reconcile` for optimistic updates

**Key insight to convey**: SolidJS stores are deeply reactive - updating a nested property only triggers effects that depend on that specific path. This is fundamentally different from React's shallow state comparison.

---

### Chapter 7: Components and Props (07-components-and-props.md)

**Purpose**: Cover SolidJS's component model, which looks like React but behaves differently.

**Sections**:
1. Component as function - Components are called once, not on every render
2. `splitProps` - Destructuring props without losing reactivity
3. `mergeProps` - Merging props with defaults
4. `children` helper - Accessing and transforming children
5. `Dynamic` component - Dynamic component rendering
6. `lazy` - Code splitting with `lazy()` and `Suspense`
7. `ParentProps` - Typing components that accept children
8. Refs and forwardRef - How refs work in SolidJS

**OpenCode examples**:
- `packages/app/src/components/button.tsx` - `splitProps` pattern with Kobalte
- `packages/ui/src/components/select.tsx` - Complex `splitProps` with generics
- `packages/app/src/app.tsx` (lines 50-57) - `lazy()` for route-level code splitting
- `packages/app/src/app.tsx` (lines 313-314) - `Dynamic` component for router
- `packages/app/src/app.tsx` (lines 67-70) - `ParentProps` typing

**React comparison**:
| React | SolidJS |
|-------|---------|
| `const Comp = (props) => ...` | Same syntax, but called once |
| `React.memo` | Not needed (no re-renders) |
| `useMemo` on JSX | Not needed (JSX is not re-created) |
| `forwardRef` | Not needed (refs are just props) |
| `React.lazy` | `lazy()` (same API) |
| `splitProps` | No equivalent (SolidJS-specific) |

---

### Chapter 8: Routing and Navigation (08-routing-and-navigation.md)

**Purpose**: Cover `@solidjs/router` and navigation patterns.

**Sections**:
1. `Router` with nested routes
2. `Route` with path parameters
3. `useNavigate` for programmatic navigation
4. `useParams` for route parameters
5. `Navigate` for redirects
6. Lazy-loaded routes with `lazy()`
7. Comparison with React Router

**OpenCode examples**:
- `packages/app/src/app.tsx` (lines 316-322) - Route configuration with `Router`, `Route`, `Navigate`
- `packages/app/src/pages/session/message-timeline.tsx` (lines 235, 490-500) - `useNavigate` for session navigation
- `packages/app/src/pages/session/composer/session-composer-region.tsx` (lines 49, 127-131) - `useNavigate` for parent navigation

---

### Chapter 9: Async and Server State (09-async-and-server-state.md)

**Purpose**: Cover async data loading patterns in SolidJS.

**Sections**:
1. `createResource` - Async data loading with Suspense integration
2. `@tanstack/solid-query` - Server state management (TanStack Query for SolidJS)
3. `Suspense` with resources - Coordinated loading states
4. `SuspenseList` - Coordinating multiple Suspense boundaries
5. WebSocket and real-time data patterns
6. Comparison with React Query and `useEffect` data fetching

**OpenCode examples**:
- `packages/app/src/app.tsx` (lines 181-198) - `createResource` for health check
- `packages/app/src/app.tsx` (lines 85-96) - `QueryClientProvider` with `@tanstack/solid-query`
- `packages/app/src/pages/session/message-timeline.tsx` (lines 387-419) - `useMutation` from `@tanstack/solid-query`
- `packages/web/src/components/Share.tsx` (lines 81-175) - WebSocket with `onMount`/`onCleanup`
- `packages/app/src/utils/persist.ts` - `createResource` for async storage initialization

---

### Chapter 10: Ecosystem and Tooling (10-ecosystem-and-tooling.md)

**Purpose**: Cover the SolidJS ecosystem, libraries, and development tooling.

**Sections**:
1. Kobalte - Headless UI components (Radix UI equivalent)
2. `@solid-primitives/*` - Community primitives library
3. Vite + `vite-plugin-solid` - Build tooling
4. TailwindCSS - Styling approach
5. Testing - Unit tests with `bun test` + `happy-dom`, E2E with Playwright
6. Storybook - Component development environment
7. Sentry - Error tracking with `@sentry/solid`
8. TypeScript - Type safety patterns

**OpenCode examples**:
- `packages/app/package.json` - All SolidJS dependencies
- `packages/app/vite.config.ts` - Vite configuration
- `packages/ui/src/components/button.tsx` - Kobalte integration
- `packages/ui/src/components/select.tsx` - Kobalte Select with SolidJS
- `packages/ui/src/components/dialog.tsx` - Kobalte Dialog
- `packages/ui/src/components/dropdown-menu.tsx` - Kobalte DropdownMenu
- `packages/app/src/context/settings.tsx` - `@solid-primitives/storage` with `makePersisted`
- `packages/app/src/pages/session/message-timeline.tsx` - `@solid-primitives/resize-observer`, `@solid-primitives/timer`
- `packages/app/src/pages/session/file-tabs.tsx` - `@solid-primitives/event-listener`

---

### Chapter 11: SSR and SSG (11-ssr-and-ssg.md)

**Purpose**: Cover server-side rendering with Astro + SolidJS islands.

**Sections**:
1. Astro with SolidJS islands - How Astro hydrates SolidJS components
2. `@astrojs/solid-js` integration
3. Hydration strategies - `client:load`, `client:idle`, `client:visible`, `client:media`
4. SSR considerations - No `window`/`document` during SSR
5. Starlight documentation framework integration
6. Comparison with Next.js + React

**OpenCode examples**:
- `packages/web/astro.config.mjs` - Astro configuration with SolidJS integration
- `packages/web/src/components/Share.tsx` - SolidJS island component
- `packages/web/src/components/share/part.tsx` - Shared component patterns

---

### Chapter 12: Optimization Guide (12-optimization-guide.md)

**Purpose**: Teach optimization patterns specific to SolidJS's reactive model.

**Sections**:
1. When to use `createMemo` vs `createSignal` - Memoization for expensive computations
2. Store structure design - Flat vs nested, normalization
3. `batch` usage - Grouping signal updates
4. `reconcile` for large data - Efficient array/object replacement
5. Avoiding unnecessary reactivity - `untrack`, `on()` with `{defer: true}`
6. Custom `equals` in signals - Preventing unnecessary effect runs
7. `createResource` deduplication - Avoiding redundant fetches
8. Virtual scrolling with `virtua` - Efficient large lists

**OpenCode examples**:
- `packages/app/src/context/settings.tsx` (lines 149-151) - `withFallback` memo pattern
- `packages/app/src/context/server.tsx` (lines 187-197) - `batch()` for atomic updates
- `packages/app/src/context/server.tsx` (lines 143-145) - `createMemo` for derived server list
- `packages/app/src/pages/session/message-timeline.tsx` (lines 1026-1037) - Custom `equals` for comment comparison
- `packages/app/src/pages/session/message-timeline.tsx` (lines 435-448) - `on()` with `{defer: true}`
- `packages/app/src/context/sync.tsx` - `reconcile` for data synchronization

---

### Chapter 13: Common Patterns (13-common-patterns.md)

**Purpose**: Solve real-world problems React developers face when switching to SolidJS.

**Sections**:
1. Forms - Controlled inputs with `createSignal` or stores
2. Animations - CSS transitions, `useSpring` from custom motion component
3. Refs - Getting DOM refs in SolidJS
4. Interop with non-reactive libraries - Using `createEffect` with `onCleanup`
5. Drag and drop - `@thisbeyond/solid-dnd`
6. Code splitting - `lazy()` with preloading
7. i18n - `@solid-primitives/i18n`
8. Media queries - `@solid-primitives/media`
9. WebSocket - `@solid-primitives/websocket`
10. Resize Observer - `@solid-primitives/resize-observer`
11. Timer - `@solid-primitives/timer`

**OpenCode examples**:
- `packages/app/src/components/prompt-input.tsx` - Form input patterns
- `packages/app/src/pages/session/composer/session-composer-region.tsx` (lines 119-121) - `useSpring` animation
- `packages/app/src/pages/session/file-tabs.tsx` (lines 56-172) - `createScrollSync` with refs and event listeners
- `packages/app/src/utils/solid-dnd.tsx` - Drag and drop
- `packages/app/src/app.tsx` (lines 50-57) - `lazy()` with preloading
- `packages/app/src/context/language.tsx` - i18n with `@solid-primitives/i18n`
- `packages/app/src/pages/session/message-timeline.tsx` (lines 364-370) - `createResizeObserver`
- `packages/app/src/pages/session/message-timeline.tsx` (line 277) - `makeTimer`

---

### Chapter 14: Migration Guide (14-migration-guide.md)

**Purpose**: Practical guide for migrating a React project to SolidJS.

**Sections**:
1. Mental model shift - From re-render to fine-grained reactivity
2. Component migration - Step-by-step component conversion
3. State management migration - useState/useReducer to createSignal/createStore
4. Effect migration - useEffect to createEffect
5. Context migration - React.createContext to createContext or createSimpleContext
6. Routing migration - React Router to @solidjs/router
7. Third-party library migration - Finding SolidJS equivalents
8. Common migration pitfalls

**React to SolidJS mapping table**:
| React Concept | SolidJS Equivalent |
|---------------|-------------------|
| `useState` | `createSignal` |
| `useReducer` | `createStore` with updater functions |
| `useEffect` | `createEffect` |
| `useMemo` | `createMemo` |
| `useCallback` | Not needed (functions are stable) |
| `useRef` | `let variable` or `createSignal` |
| `useContext` | `createContext` + `useContext` |
| `React.memo` | Not needed |
| `forwardRef` | Not needed |
| `React.lazy` | `lazy()` |
| `Suspense` | `Suspense` |
| `ErrorBoundary` | `ErrorBoundary` |
| `useTransition` | `startTransition` from SolidJS |
| `useDeferredValue` | `createDeferred` |
| `useId` | Not needed (no hydration mismatches) |
| `useSyncExternalStore` | Not needed (signals are the store) |
| `useInsertionEffect` | Not needed |
| `useDebugValue` | Not needed |

---

### Chapter 15: Risks and Pitfalls (15-risks-and-pitfalls.md)

**Purpose**: Honest assessment of SolidJS's limitations and risks.

**Sections**:
1. Over-reactivity - Creating too many signals when a store would be better
2. Memory leaks - Unclosed effects, unsubscribed observers
3. Store leaks - Not cleaning up store entries for destroyed views
4. SSR/SSG considerations - Limited ecosystem for SSG
5. Ecosystem maturity - Smaller community, fewer third-party libraries
6. Learning curve - Reactive thinking is different from component thinking
7. Debugging - Tools are less mature than React DevTools
8. Bundle size concerns - SolidJS is small, but ecosystem libraries may not be

**OpenCode examples**:
- `packages/app/src/context/layout.tsx` (lines 267-323) - Session key pruning to prevent store leaks
- `packages/app/src/context/server.tsx` (lines 154-177) - Health polling with proper cleanup
- `packages/app/src/pages/session/message-timeline.tsx` (lines 156-161) - `cancelAnimationFrame` cleanup
- `packages/app/src/pages/session/composer/session-composer-region.tsx` (lines 88-97, 117) - Timer cleanup with `onCleanup`

---

### Appendix: Cheat Sheet (appendix-cheatsheet.md)

**Purpose**: Quick reference for React developers.

**Content**: A comprehensive table mapping every React API to its SolidJS equivalent, with brief notes and page references to the relevant chapters.

---

## Implementation Sequence

The chapters should be written in this order, as each builds on the previous:

1. `01-introduction.md` - Foundation, sets the motivation
2. `02-how-solid-works.md` - Mental model, essential for everything else
3. `03-signals-and-memos.md` - Most fundamental primitive
4. `04-effects-and-lifecycle.md` - Second fundamental primitive
5. `05-control-flow.md` - JSX patterns (depends on signals/effects)
6. `06-stores-and-state-management.md` - Complex state (depends on signals)
7. `07-components-and-props.md` - Component model (depends on all above)
8. `08-routing-and-navigation.md` - Routing (depends on components)
9. `09-async-and-server-state.md` - Async (depends on effects, Suspense)
10. `10-ecosystem-and-tooling.md` - Ecosystem (reference chapter)
11. `11-ssr-and-ssg.md` - SSR (depends on components, async)
12. `12-optimization-guide.md` - Optimization (depends on all above)
13. `13-common-patterns.md` - Patterns (depends on all above)
14. `14-migration-guide.md` - Migration (depends on all above)
15. `15-risks-and-pitfalls.md` - Risks (depends on all above)
16. `appendix-cheatsheet.md` - Reference (depends on all above)
17. `README.md` - Index (written last)
18. `docker-compose.yml` - Dev setup (written last)

---

## Docker Compose Design

The `docker-compose.yml` should set up:

1. **OpenCode server** - The backend server that the SolidJS app connects to
2. **OpenCode app** - The SolidJS Vite dev server with hot reload
3. **OpenCode web** - The Astro dev server with SolidJS islands

Services:
- `opencode-server` - Port 8080, runs the OpenCode backend
- `opencode-app` - Port 3000, Vite dev server with HMR
- `opencode-web` - Port 4321, Astro dev server

Volumes:
- `./packages/app/src:/app/packages/app/src` - Hot reload for app
- `./packages/ui/src:/app/packages/ui/src` - Hot reload for UI library
- `./packages/web/src:/app/packages/web/src` - Hot reload for web

---

## Code Example Sourcing Strategy

For each chapter, code examples should be sourced from these key files:

| Chapter | Primary Source Files |
|---------|---------------------|
| 1 (Intro) | `app.tsx`, `context/settings.tsx`, `context/server.tsx` |
| 2 (How it works) | `context/server.tsx`, `context/settings.tsx` |
| 3 (Signals) | `pages/session/message-timeline.tsx`, `context/settings.tsx` |
| 4 (Effects) | `context/server.tsx`, `pages/session/message-timeline.tsx`, `pages/session/file-tabs.tsx` |
| 5 (Control Flow) | `app.tsx`, `pages/session/message-timeline.tsx`, `pages/session/composer/session-composer-region.tsx` |
| 6 (Stores) | `context/settings.tsx`, `context/server.tsx`, `context/layout.tsx`, `utils/persist.ts` |
| 7 (Components) | `ui/src/components/button.tsx`, `ui/src/components/select.tsx`, `app.tsx` |
| 8 (Routing) | `app.tsx`, `pages/session/message-timeline.tsx` |
| 9 (Async) | `app.tsx`, `pages/session/message-timeline.tsx`, `web/src/components/Share.tsx` |
| 10 (Ecosystem) | `package.json`, `vite.config.ts`, `ui/src/components/*.tsx` |
| 11 (SSR) | `web/astro.config.mjs`, `web/src/components/Share.tsx` |
| 12 (Optimization) | `context/settings.tsx`, `context/server.tsx`, `context/sync.tsx` |
| 13 (Patterns) | `components/prompt-input.tsx`, `pages/session/file-tabs.tsx`, `utils/solid-dnd.tsx` |
| 14 (Migration) | All files (comparison reference) |
| 15 (Risks) | `context/layout.tsx`, `context/server.tsx` |

---

## Quality Checklist

For each chapter, verify:
- [ ] At least 3 real OpenCode code snippets
- [ ] React comparison where applicable
- [ ] Chinese language throughout
- [ ] Practical, example-driven, not theoretical
- [ ] Each concept has a "why" explanation
- [ ] Code snippets include file paths for context
- [ ] No fabricated code - all examples from actual project files

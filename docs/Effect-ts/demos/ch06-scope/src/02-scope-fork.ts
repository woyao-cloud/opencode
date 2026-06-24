/**
 * 02-scope-fork.ts — Scope.fork 子作用域
 *
 * Scope.fork(scope, strategy?) 在当前 Scope 内创建一个子 Scope（Closeable）。
 * 通过 Scope.use(childScope)(effect) 在子 Scope 中执行 Effect。
 *
 * 子 Scope 可以独立关闭，不影响父 Scope。
 * 当父 Scope 关闭时，所有子 Scope 也会被级联关闭。
 *
 * 典型场景：
 * - 为一个请求创建子 Scope，请求结束时释放该请求的资源
 * - 并行任务各自拥有独立的资源生命周期
 */
import { Effect, Console, Scope, Exit } from "effect"

// ---------------------------------------------------------------------------
// 1. 模拟可追踪的资源
// ---------------------------------------------------------------------------

let resourceCounter = 0

/** 创建受 Scope 管理的可追踪资源 */
const makeResource = (label: string): Effect.Effect<
  { readonly label: string; readonly doWork: () => Effect.Effect<string> },
  never,
  Scope.Scope
> =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const id = ++resourceCounter
      Console.log(`[acquire] 创建资源 "${label}" (id: ${id})`)
      return {
        label: `${label}#${id}`,
        doWork: () => Effect.succeed(`[${label}#${id}] 工作完成`),
      }
    }),
    (resource, exit) =>
      Effect.sync(() => {
        const status = Exit.isSuccess(exit) ? "成功" : "失败"
        Console.log(`[release] 释放资源 "${resource.label}" (退出: ${status})`)
      }),
  )

// ---------------------------------------------------------------------------
// 2. 场景 1：子 Scope 独立生命周期
// ---------------------------------------------------------------------------

/**
 * 在父 Scope 中 fork 一个子 Scope。
 * 子 Scope 中的资源在子 Scope 关闭时释放，
 * 父 Scope 中的资源不受影响。
 *
 * API 说明：
 * - Scope.fork(scope, strategy?): Effect<Closeable> 创建子 Scope
 * - Scope.use(childScope)(effect): Effect<...> 在子 Scope 中执行 effect
 */
const program1 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("=== 场景 1: 子 Scope 独立生命周期 ===")

    // 获取当前 Scope（从 Context 中）
    const scope = yield* Scope.Scope

    // 在父 Scope 中创建资源
    const parentResource = yield* makeResource("父级资源")

    // 使用 Scope.fork 创建子 Scope
    const childScope = yield* Scope.fork(scope)

    // 在子 Scope 中执行任务
    yield* Scope.use(childScope)(
      Effect.gen(function* () {
        const childResource = yield* makeResource("子级资源")
        const result = yield* childResource.doWork()
        Console.log(`子 Scope 内: ${result}`)
        Console.log("[子Scope] 即将关闭，子级资源将被释放")
      }),
    )

    // 子 Scope 已关闭，子级资源已释放，父资源仍可用
    const parentResult = yield* parentResource.doWork()
    Console.log(`父 Scope 内: ${parentResult}`)
    Console.log("[父Scope] 即将关闭，父级资源将被释放")
  }),
)

// ---------------------------------------------------------------------------
// 3. 场景 2：子 Scope 中的错误隔离
// ---------------------------------------------------------------------------

/**
 * 子 Scope 中的错误不会影响父 Scope。
 * 即使子 Scope 中的 Effect 失败，子 Scope 的资源仍会被释放，
 * 父 Scope 可以继续正常运行。
 */
const program2 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 2: 子 Scope 错误隔离 ===")

    const scope = yield* Scope.Scope
    const parentResource = yield* makeResource("父级资源")

    const childScope = yield* Scope.fork(scope)

    // 使用 Effect.exit 捕获子 Scope 的退出状态（成功或失败）
    const childExit = yield* Effect.exit(
      Scope.use(childScope)(
        Effect.gen(function* () {
          const childResource = yield* makeResource("子级资源")
          Console.log("子 Scope: 即将失败...")
          yield* Effect.fail(new Error("子任务执行失败"))
        }),
      ),
    )

    // 使用 Exit.match 模式匹配处理成功/失败
    const msg = Exit.match(childExit, {
      onSuccess: () => "子 Scope: 成功完成",
      onFailure: (_cause) => "子 Scope: 执行失败",
    })
    Console.log(`父 Scope: ${msg}`)

    const result = yield* parentResource.doWork()
    Console.log(`父 Scope: ${result}`)
  }),
)

// ---------------------------------------------------------------------------
// 4. 场景 3：嵌套子 Scope（LIFO 释放顺序）
// ---------------------------------------------------------------------------

/**
 * 可以创建多层嵌套的子 Scope。
 * 内层子 Scope 关闭时只释放内层资源，
 * 外层子 Scope 关闭时释放外层 + 所有内层资源。
 * 释放顺序：LIFO（后进先出）。
 */
const program3 = Effect.scoped(
  Effect.gen(function* () {
    Console.log("\n=== 场景 3: 嵌套子 Scope ===")

    const scope = yield* Scope.Scope
    const outerChild = yield* Scope.fork(scope)

    yield* Scope.use(outerChild)(
      Effect.gen(function* () {
        const outerResource = yield* makeResource("外层资源")

        // 在外层子 Scope 中再 fork 一个内层子 Scope
        const innerChild = yield* Scope.fork(outerChild)

        yield* Scope.use(innerChild)(
          Effect.gen(function* () {
            const innerResource = yield* makeResource("内层资源")
            const result = yield* innerResource.doWork()
            Console.log(`内层 Scope: ${result}`)
            // 内层 Scope 关闭 → 释放内层资源
          }),
        )

        // 内层 Scope 已关闭，外层资源仍可用
        const result = yield* outerResource.doWork()
        Console.log(`外层 Scope: ${result}`)
        // 外层 Scope 关闭 → 释放外层资源
      }),
    )
  }),
)

// ---------------------------------------------------------------------------
// 运行
// ---------------------------------------------------------------------------

Effect.runPromise(program1)
  .then(() => Effect.runPromise(program2))
  .then(() => Effect.runPromise(program3))

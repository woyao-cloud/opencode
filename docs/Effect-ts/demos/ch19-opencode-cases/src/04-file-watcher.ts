/**
 * 案例 4: 文件监听器 — Fiber + Scope 模式
 *
 * 本 demo 模拟 OpenCode 中 file/watcher.ts 的核心模式：
 * 使用 Fiber 管理后台监听任务，使用 Scope 确保 Fiber 生命周期
 * 与监听器绑定，使用 Effect.addFinalizer 注册清理逻辑。
 *
 * 关键 API:
 * - Effect.forkScoped — 在 Scope 中派生 Fiber，Scope 结束时自动中断
 * - Effect.addFinalizer — 注册资源清理回调
 * - Effect.acquireUseRelease — 资源安全获取/使用/释放
 * - Scope — 结构化并发的作用域管理
 * - Effect.scoped — 进入 Scope 上下文
 */

import {
  Context,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Layer,
  Queue,
  Scope,
  Stream,
  Console,
  Schedule,
} from "effect"

// ============================================================
// 1. 定义文件事件类型
// ============================================================

// 文件事件 — 类似 OpenCode 的 Event.Updated
export interface FileEvent {
  readonly file: string
  readonly event: "add" | "change" | "unlink"
}

// ============================================================
// 2. 定义服务接口
// ============================================================

export interface FileWatcherInterface {
  readonly init: () => Effect.Effect<void>
  readonly events: () => Stream.Stream<FileEvent>
}

export class FileWatcherService extends Context.Service<
  FileWatcherService,
  FileWatcherInterface
>()("@demo/FileWatcher") {}

// ============================================================
// 3. 模拟文件系统变更
// ============================================================

// 模拟文件变更序列
const mockFileChanges: FileEvent[] = [
  { file: "/project/src/main.ts", event: "change" },
  { file: "/project/src/utils.ts", event: "add" },
  { file: "/project/README.md", event: "change" },
  { file: "/project/src/old.ts", event: "unlink" },
  { file: "/project/src/new-feature.ts", event: "add" },
]

// ============================================================
// 4. 实现文件监听器 — 类似 OpenCode 的 FileWatcher.layer
// ============================================================

export const FileWatcherLayer = Layer.effect(
  FileWatcherService,
  Effect.gen(function* () {
    // 文件事件队列 — 类似 OpenCode 的 Bus
    const eventQueue = yield* Queue.unbounded<FileEvent>()

    return FileWatcherService.of({
      init: () =>
        Effect.gen(function* () {
          yield* Console.log("[Watcher] 初始化文件监听器...")

          // 使用 Effect.addFinalizer 注册清理逻辑
          // 类似 OpenCode 中: yield* Effect.addFinalizer(() => ...)
          yield* Effect.addFinalizer(() =>
            Console.log("[Watcher] 监听器已关闭"),
          )

          // 使用 forkScoped 在 Scope 中启动后台监听 Fiber
          // 类似 OpenCode 中: yield* Effect.forkScoped(subscribe(...))
          yield* Effect.forkScoped(
            Effect.gen(function* () {
              yield* Console.log("[Watcher] 后台监听已启动")

              // 模拟文件系统事件 — 每 200ms 发送一个事件
              // 类似 OpenCode 中 parcel watcher 的回调
              for (const evt of mockFileChanges) {
                yield* Effect.sleep(Duration.millis(200))
                yield* Queue.offer(eventQueue, evt)
                yield* Console.log(
                  `[Watcher] 检测到变更: ${evt.event} ${evt.file}`,
                )
              }

              yield* Console.log("[Watcher] 模拟事件发送完毕")
            }),
          )
        }),

      events: () => Stream.fromQueue(eventQueue),
    })
  }),
)

// ============================================================
// 5. 使用文件监听器 — 展示 Fiber + Scope 模式
// ============================================================

const main = Effect.gen(function* () {
  const watcher = yield* FileWatcherService

  // 初始化监听器 — 在 Scope 中启动后台 Fiber
  yield* watcher.init()

  // 消费文件事件流 — 类似 OpenCode 中通过 Bus 订阅事件
  yield* Console.log("[Main] 开始监听文件变更...\n")

  // 使用 Stream.runForEach 消费事件
  // 类似 OpenCode 中: Bus.subscribe(Event.Updated, ...)
  yield* watcher.events().pipe(
    Stream.take(5), // 只处理前 5 个事件
    Stream.runForEach((event) =>
      Console.log(`[Main] 处理事件: ${event.event} — ${event.file}`),
    ),
  )

  yield* Console.log("\n[Main] 监听完成")
})

// 运行 — Effect.scoped 提供 Scope，确保所有 forkScoped 的 Fiber 自动清理
// 类似 OpenCode 中: Effect.scoped 包裹整个监听生命周期
await main.pipe(
  Effect.scoped,
  Effect.provide(FileWatcherLayer),
  Effect.runPromise,
)

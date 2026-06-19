# 附录 · Effect-TS 方法速查表 & 运行时体系图

## A. Effect-TS 方法速查表

按字母排序，列出全书涉及的所有 Effect-TS 方法。每个方法包含：一句话说明、典型使用场景、所在章节。

| 方法 | 说明 | 典型场景 | 章节 |
|------|------|---------|------|
| `bridge.fork(effect)` | Effect → 后台 Fiber，不等待结果 | 非关键后台操作 | 8 |
| `bridge.promise(effect)` | Effect → Promise（恢复 Workspace 上下文） | 工具 execute()、事件分发 | 4,5,8 |
| `bridge.sync(fn)` | 同步函数 → Effect（恢复 Workspace 上下文） | 异步回调中的同步操作 | 8 |
| `Cause.squash(cause)` | 从 Cause 中提取原始错误 | 错误处理 | 3 |
| `Effect.all(effects)` | 并发执行多个 Effect，等全部完成 | System Prompt 并发准备 | 3 |
| `Effect.catch(error, handler)` | 捕获特定错误类型，执行恢复 | 远程 URL 超时降级 | 6 |
| `Effect.catchCause(handler)` | 捕获所有错误（含缺陷），执行恢复 | 子任务失败不中断主流程 | 4 |
| `Effect.die(error)` | 将错误作为缺陷抛出（不可恢复） | 模型未找到等致命错误 | 1 |
| `Effect.exit` | 执行 Effect 返回 Exit（不抛异常） | 模型查找——失败时检查 Exit | 3 |
| `Effect.fn(name, gen)` | 创建命名的生成器风格 Effect | runLoop、createUserMessage | 3 |
| `Effect.forEach(iter, fn, opts)` | 对每个元素执行 Effect，支持并发控制 | 指令文件并发加载 | 6 |
| `Effect.forkIn(scope)` | 在 Scope 中启动后台 Fiber | 标题生成、压缩清理 | 3 |
| `Effect.gen(function*(){})` | 创建生成器风格 Effect | 几乎所有业务逻辑 | 全章 |
| `Effect.ignore` | 忽略 Effect 结果（成功/失败→成功） | fire-and-forget 操作 | 3,7 |
| `Effect.onInterrupt(callback)` | 注册中断清理回调 | 用户取消时的状态清理 | 3,4 |
| `Effect.option` | 成功/失败 → Option(Some/None) | 文件存在性检查 | 6 |
| `Effect.orDie` | 错误 → 缺陷（"不应该失败"） | 权限检查、指令加载 | 2,4,6 |
| `Effect.promise(() => p)` | Promise → Effect（支持 AbortSignal） | MCP 工具、文件锁 | 4,7,8 |
| `Effect.provide(layer)` | 手动注入 Layer 依赖 | 数据库初始化 | 7 |
| `Effect.provideService(tag, val)` | 注入服务实例到 Effect 环境 | CLI 命令、HTTP 中间件 | 1,2 |
| `Effect.runFork(effect)` | 启动 Fiber，立即返回 | bridge.fork 底层 | 8 |
| `Effect.runPromise(effect)` | Effect → Promise 并执行 | CLI 命令、OAuth 流程 | 1,2,7 |
| `Effect.runPromiseExit(effect)` | Effect → Exit（不抛异常） | 服务停止 | 2,8 |
| `Effect.runSync(effect)` | 同步执行 Effect（阻塞） | 数据库初始化 | 7 |
| `Effect.succeed(value)` | 创建立即成功的 Effect | 事件回调返回值 | 5 |
| `Effect.sync(() => value)` | 创建同步 Effect（不会失败） | 纯计算、bridge.sync | 4,7,8 |
| `Effect.timeout(duration)` | 设置超时，超时后 Effect 失败 | 远程 URL 获取 | 6 |
| `Effect.void` | 创建成功但不带值的 Effect | 不需要返回值的操作 | 5 |
| `Effect.withSpan(name, opts)` | 添加 OpenTelemetry Span | MCP 工具追踪 | 4 |
| `EffectBridge.fromPromise(fn)` | Promise 函数 → Effect（恢复 Workspace） | Workspace Adapter 集成 | 8 |
| `EffectBridge.make()` | 创建桥接器实例 | 工具执行、事件总线 | 4,5,8 |
| `Exit.isFailure(exit)` | 检查 Exit 是否为失败 | 错误处理 | 3 |
| `Latch.make()` / `open` / `await` | 一次性同步信号 | Shell 执行同步 | 3 |
| `Layer.effect(tag, effect)` | 从 Effect 创建 Layer | 中间件 Layer 创建 | 2 |
| `Layer.provide(layer, target)` | 注入依赖到 target Layer | 组装 defaultLayer | 1,6 |
| `Layer.provideMerge(l1, l2, ...)` | 合并多个 Layer | 中间件链组装 | 2 |
| `Layer.suspend(thunk)` | 延迟 Layer 创建（解决循环依赖） | Session ↔ Compaction | 6 |
| `makeRuntime(service, layer)` | 创建轻量 Effect 运行时 | 事件总线、版本检查 | 5,7 |
| `ManagedRuntime.make(layer)` | 创建完整 Effect 运行时 | AppRuntime、BootstrapRuntime | 1 |
| `Option.isNone(opt)` | 检查 Option 是否为 None | 文件存在性检查 | 6 |
| `Queue.offer(q, elem)` | 向 Queue 添加元素（Effect 版） | 事件入队 | 5 |
| `Queue.offerUnsafe(q, elem)` | 向 Queue 添加元素（同步版） | 非 Effect 上下文事件发布 | 5 |
| `serviceUse(service)` | 生成服务访问器函数 | Compaction、Project | 6 |
| `Stream.fromQueue(queue)` | Queue → Stream | 事件分发 | 5 |
| `Stream.runCollect(stream)` | 收集流中所有元素到数组 | Glob/Grep 结果收集 | 4 |
| `Stream.runDrain(stream)` | 消费流但不处理元素 | 驱动 LLM 事件流 | 3 |
| `Stream.runForEach(stream, fn)` | 消费流中每个元素，执行回调 | Shell 输出、事件分发 | 3,4,5 |

## B. 运行时体系图

```text
┌─────────────────────────────────────────────────────────────┐
│                    opencode Effect 运行时体系                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ AppRuntime (effect/app-runtime.ts)                   │    │
│  │ ManagedRuntime.make(AppLayer)                        │    │
│  │                                                     │    │
│  │ 提供: runPromise, runSync, runFork, runPromiseExit   │    │
│  │ 依赖: 完整的 AppLayer (所有服务的 Layer 合并)         │    │
│  │                                                     │    │
│  │ 使用场景: CLI 命令 (effect-cmd.ts)                   │    │
│  │         ACP 运行时 (acp/runtime.ts)                  │    │
│  │         HTTP 栅栏 (server/shared/fence.ts)           │    │
│  │         项目实例管理 (project/instance-runtime.ts)   │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ↑                                   │
│                          │ 依赖                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ BootstrapRuntime (effect/bootstrap-runtime.ts)       │    │
│  │ ManagedRuntime.make(BootstrapLayer)                  │    │
│  │                                                     │    │
│  │ 提供: runPromise, runSync                            │    │
│  │ 依赖: 启动阶段所需的最小 Layer 集合                   │    │
│  │                                                     │    │
│  │ 使用场景: 应用启动早期（数据库初始化之前）            │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ makeRuntime() (effect/run-service.ts)                │    │
│  │ 轻量运行时工厂                                        │    │
│  │                                                     │    │
│  │ 提供: runPromise, runSync                            │    │
│  │ 依赖: 单个 Service + 单个 Layer                       │    │
│  │                                                     │    │
│  │ 使用场景: 事件总线 (bus/index.ts)                     │    │
│  │         Compaction (session/compaction.ts)           │    │
│  │         版本检查 (installation/index.ts)             │    │
│  │         TUI 配置 (cli/cmd/tui/config/tui.ts)         │    │
│  │         LSP 客户端 (lsp/client.ts)                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 直接 Effect.runPromise / Effect.runSync              │    │
│  │ 无运行时，手动 provide Layer                          │    │
│  │                                                     │    │
│  │ 使用场景: 数据库初始化 (storage/db.ts)               │    │
│  │         OAuth 流程 (mcp/oauth-provider.ts)           │    │
│  │         GitHub 命令 (cli/cmd/github.ts)              │    │
│  │         消息转换 (session/message-v2.ts)             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 运行时选择原则

| 场景 | 推荐运行时 | 原因 |
|------|-----------|------|
| CLI 命令（需要完整依赖） | `AppRuntime` | 提供所有服务的依赖注入 |
| 独立功能模块（单一服务） | `makeRuntime` | 轻量，不启动全局运行时 |
| 启动早期（数据库未初始化） | `BootstrapRuntime` | 最小依赖集合 |
| 临时 Effect 执行 | `Effect.runPromise` + `Effect.provide` | 最简单，手动注入依赖 |
| 同步初始化 | `Effect.runSync` | 阻塞执行，确保顺序 |

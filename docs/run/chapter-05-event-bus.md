# 第 5 章 · 事件总线

## 5.1 场景概述

opencode 的事件总线是框架内各模块之间解耦通信的核心机制。当会话中发生事件（消息创建、工具执行、Step 完成等），发布者通过 Event Bus 发布事件，多个消费者（日志、同步持久化、Trace、UI）独立订阅并响应。事件总线的核心是一个 Effect Stream——发布者向 Stream 发送事件，消费者从 Stream 读取事件。

为什么需要 Effect？事件总线需要管理多个并发消费者、处理背压（消费者慢于发布者）、确保事件不丢失。Effect 的 Stream 和 Queue 提供了这些能力，而 `EffectBridge` 让非 Effect 代码也能发布事件。

## 5.2 触发流程

```text
事件发布者 (如 session/prompt.ts)
    │
    │  bus.publish(Session.Event.Error, { sessionID, error })
    ▼
┌─ bus/index.ts ─────────────────────────────────────────────┐
│                                                             │
│  ① publish() 函数:                                          │
│     const { runPromise } = makeRuntime(Service, layer)      │
│     return runPromise((svc) => svc.publish(def, props))     │
│                                                             │
│  ② Service.publish() 内部:                                  │
│     const bridge = yield* EffectBridge.make()               │
│     // 将事件发送到 Stream                                   │
│     bridge.promise(                                         │
│       Effect.gen(function* () {                             │
│         yield* Queue.offer(queue, event)                    │
│       })                                                    │
│     )                                                       │
│                                                             │
│  ③ 事件分发 (Stream.runForEach):                            │
│     Stream.runForEach(                                      │
│       Stream.fromQueue(queue),                              │
│       (msg) => Effect.gen(function* () {                    │
│         // 分发给所有订阅者                                  │
│         for (const sub of subscribers) {                    │
│           yield* sub(msg)                                   │
│         }                                                   │
│       })                                                    │
│     )                                                       │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ 消费者 ───────────────────────────────────────────────────┐
│  · sync/index.ts: 事件持久化到 SQLite                        │
│  · cli/cmd/run/trace.ts: JSONL 事件追踪                     │
│  · cli/cmd/run.ts: UI 渲染更新                              │
│  · packages/core/src/util/log.ts: 日志记录                  │
└────────────────────────────────────────────────────────────┘
```

## 5.3 关键触发点详解

### 触发点 1：makeRuntime — 事件总线的轻量运行时

**文件**：`bus/index.ts:179-192`

```typescript
const { runPromise, runSync } = makeRuntime(Service, layer)

export function publish(def, properties, options) {
  return runPromise((svc) => svc.publish(def, properties, options))
}
```

**自然语言解释**：事件总线不需要完整的 `AppRuntime`（全局运行时），它只需要自己的 `Service` 和 `layer`。`makeRuntime` 从单个服务+Layer 创建一个轻量运行时，提供 `runPromise` 和 `runSync` 方法。`publish` 函数使用 `runPromise` 执行 `svc.publish()`——这是一个 Effect（因为发布可能失败），通过 `runPromise` 转换为 Promise 供外部调用。这种"按需创建运行时"的模式避免了启动全局运行时的开销。

### 触发点 2：EffectBridge 在事件总线中的角色

**文件**：`bus/index.ts:134-140`

```typescript
const bridge = yield* EffectBridge.make()

// 事件分发循环
yield* bridge.promise(
  Stream.runForEach(
    Stream.fromQueue(queue),
    (msg) => Effect.gen(function* () {
      for (const sub of subscribers) {
        yield* sub(msg)
      }
    })
  )
)
```

**自然语言解释**：事件分发是一个长期运行的 Stream 消费循环——从 Queue 中读取事件，分发给所有订阅者。这个循环本身是一个 Effect（`Stream.runForEach` 返回 Effect），但事件总线的初始化代码在非 Effect 上下文中。`bridge.promise` 将这个长期运行的 Effect 转换为 Promise，让它在后台持续运行。`Stream.fromQueue` 将 Effect Queue 转换为 Stream——每当有事件被 `Queue.offer` 放入队列，Stream 就产生一个元素。

### 触发点 3：Queue.offerUnsafe — 非 Effect 上下文中的事件入队

**文件**：`bus/index.ts`（内部实现）

```typescript
// 在非 Effect 上下文中发布事件
Queue.offerUnsafe(queue, event)
```

**自然语言解释**：有些事件发布者不在 Effect 上下文中（如 CLI 的事件循环回调）。`Queue.offerUnsafe` 允许在非 Effect 上下文中向 Queue 添加元素——"unsafe"意味着它绕过了 Effect 的类型安全检查，但这是必要的桥接。事件入队后，`Stream.fromQueue` 自动将其传递给 Stream 消费者。

### 触发点 4：sync 持久化 — Effect.runPromise 触发

**文件**：`sync/index.ts:361`

```typescript
Effect.runPromise(
  Effect.gen(function* () {
    const svc = yield* Service
    yield* svc.process(event)
  }).pipe(Effect.provide(layer))
)
```

**自然语言解释**：事件同步模块在收到事件后，需要将其持久化到 SQLite。`svc.process(event)` 返回 Effect（数据库写入可能失败），用 `Effect.runPromise` 执行。这里手动 `Effect.provide(layer)` 注入依赖，而不是使用全局 `AppRuntime`——因为 sync 模块只需要自己的 Layer。

## 5.4 涉及的 Effect 方法

### `makeRuntime(service, layer)`
**作用**：从单个服务+Layer 创建轻量 Effect 运行时。返回 `{ runPromise, runSync }`。

**本章使用场景**：事件总线的 `publish` 函数——不需要全局运行时，只需总线自己的服务。

### `Stream.fromQueue(queue)`
**作用**：将 Effect Queue 转换为 Stream。Queue 中的元素自动成为 Stream 的元素。

**本章使用场景**：事件总线——发布者向 Queue 添加事件，Stream 自动传递给消费者。

### `Queue.offer(queue, element)` / `Queue.offerUnsafe(queue, element)`
**作用**：向 Queue 添加元素。`offer` 是 Effect 版本（类型安全），`offerUnsafe` 是同步版本（可在非 Effect 上下文调用）。

**本章使用场景**：事件发布——`offerUnsafe` 让非 Effect 代码也能发布事件。

### `Stream.runForEach(stream, fn)`
**作用**：消费流中每个元素，执行回调 Effect。返回一个 Effect，在流结束时完成。

**本章使用场景**：事件分发——从 Stream 读取事件，分发给所有订阅者。

### `EffectBridge.make()` / `bridge.promise(effect)`
**作用**：创建桥接器，将 Effect 转换为 Promise。

**本章使用场景**：事件分发循环——将长期运行的 Stream 消费 Effect 转换为 Promise 在后台运行。

### `Effect.runSync(effect)`
**作用**：同步执行 Effect（调用会阻塞直到 Effect 完成）。要求 Effect 不包含异步操作。

**本章使用场景**：某些不需要异步的事件处理。

### `Effect.succeed(value)` / `Effect.void`
**作用**：创建立即成功的 Effect。`Effect.succeed` 携带值，`Effect.void` 不带值（返回 undefined）。

**本章使用场景**：订阅者回调中不需要返回值的场景。

## 5.5 本章小结

事件总线的 Effect 触发围绕"Queue → Stream → 消费者"的流式架构展开。`makeRuntime` 为总线创建轻量运行时，`Queue.offerUnsafe` 让非 Effect 代码也能发布事件，`Stream.fromQueue` + `Stream.runForEach` 驱动事件分发循环，`EffectBridge` 将长期运行的 Stream 消费 Effect 桥接到 Promise 世界。这套设计让事件总线既能在 Effect 世界内高效运行，又能被非 Effect 代码使用。

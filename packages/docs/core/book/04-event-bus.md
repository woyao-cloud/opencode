# EventV2：解耦的事件总线

> **目标读者**：熟悉 Spring `ApplicationEvent` / `@EventListener` 或消息队列（RabbitMQ/Kafka）的开发者。
> **本章目标**：理解 EventV2 如何通过 PubSub 实现解耦，以及三种订阅模式各自的使用场景。

---

## 4.1 从一个真实的问题开始

假设用户创建了一个新会话。系统需要：

1. **保存到数据库**
2. **推送到 WebSocket**（前端实时更新）
3. **写入审计日志**（合规要求）
4. **同步到企业版后端**

### 4.1.1 Spring 的做法

```java
// Java Spring: 用 ApplicationEventPublisher
@Service
public class SessionService {
    @Autowired
    private ApplicationEventPublisher publisher;

    public Session createSession(String title) {
        Session session = saveToDb(title);

        // 发布事件
        publisher.publishEvent(new SessionCreatedEvent(session));

        return session;
    }
}

// 消费者 1: 保存到数据库（其实发布者已经做了）
@Component
public class SessionDatabaseListener {
    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        // 难道再保存一次？不对，这里应该做其他事
    }
}

// 消费者 2: WebSocket 推送
@Component
public class SessionWebSocketListener {
    @EventListener
    public void onSessionCreated(SessionCreatedEvent event) {
        websocket.push(event.getSession());
    }
}
```

Spring 的问题：
- **事件定义繁琐**：需要新建一个 Event 类
- **同步执行**：默认情况下 `publishEvent` 是同步的，所有监听器执行完才返回
- **没有流式订阅**：不能做 `filter`、`map` 等操作
- **错误处理隐式**：监听器抛异常会影响发布者

### 4.1.2 EventV2 的做法

```typescript
// TypeScript EventV2

// 1. 定义事件（一行）
const SessionCreated = EventV2.define({
  type: "session.created",
  schema: { sessionID: Schema.String, title: Schema.String },
})

// 2. 发布（发布者只关心发布，不关心谁在听）
yield* EventV2.Service.publish(SessionCreated, {
  sessionID: "ses_001",
  title: "Fix login bug",
})

// 3. 消费者各自注册（互不干扰，可以 fork 到独立纤程）
// 消费者 A: WebSocket 推送（异步）
yield* Effect.forkIn(scope)(
  EventV2.Service.subscribe(SessionCreated).pipe(
    Stream.tap((event) => websocket.push(event.data)),
    Stream.runDrain,
  )
)

// 消费者 B: 审计日志（必须在响应返回前完成）
yield* EventV2.Service.sync((event) =>
  auditLog.write(event)
)
```

---

## 4.2 EventV2 的核心概念

### 4.2.1 事件定义

```typescript
// EventV2.define() 返回一个 "既是 Schema 又是 Definition" 的对象
const MyEvent = EventV2.define({
  type: "my.event.type",            // 唯一事件类型标识
  version: 1,                        // 可选：事件版本
  aggregate: "my-aggregate",         // 可选：聚合标识
  schema: {                          // 事件数据的 Schema
    key: Schema.String,
    value: Schema.Number,
  },
})
```

### 4.2.2 事件发布流程

```
发布者                          EventV2.Service
  │                                  │
  │  publish(MyEvent, data)          │
  │─────────────────────────────────▶│
  │                                  │
  │                                  │── 1. 遍历 sync handlers (同步) ──▶ 同步消费者
  │                                  │
  │                                  │── 2. 发布到 typed PubSub ───────▶ 异步消费者
  │                                  │
  │                                  │── 3. 发布到 all PubSub ─────────▶ 全量流消费者
  │                                  │
  │◀────────── Payload ◀────────────│
```

### 4.2.3 三种订阅模式

```typescript
// 模式 A: 按类型订阅（99% 的场景用这个）
const stream = EventV2.Service.subscribe(MyEvent)
// 返回 Stream<Payload<MyEvent>>，只包含 MyEvent 类型的事件
// 可以链式调用 .pipe(Stream.filter(...), Stream.map(...))

// 模式 B: 全量流（审计、调试用）
const allStream = EventV2.Service.all()
// 返回 Stream<Payload>，包含所有事件类型
// 适合: 审计日志、全局监控、调试观察

// 模式 C: 同步钩子（需要在响应返回前完成的操作）
EventV2.Service.sync((event) => auditLog.write(event))
// 发布者会等待 sync handler 执行完成
// 适合: 写审计日志、更新关键状态
```

---

## 4.3 何时使用同步 vs 异步

```
事件发布
    │
    ├── sync —— 发布者等待完成
    │   场景: "在响应返回前必须完成"
    │   示例: 写审计日志、扣减库存
    │   代价: 阻塞发布者
    │
    └── typed subscribe —— 发布者不等待
        场景: "后续处理即可"
        示例: 发邮件通知、推送 UI 更新
        优点: 不阻塞主流程
```

| 场景 | 应该用 | 原因 |
|------|--------|------|
| 审计日志 | `sync()` | 法规要求操作必须有记录，响应返回前必须写入 |
| WebSocket 推送 | `subscribe()` | 晚 100ms 推送没问题，不应阻塞用户操作 |
| 发送通知邮件 | `subscribe()` | 邮件可能耗时几秒，不应阻塞 API 响应 |
| 更新缓存 | `subscribe()` | 缓存最终一致即可 |
| 扣减库存 | `sync()` | 必须在确认库存后才能返回"下单成功" |

---

## 4.4 完整示例：会话创建事件

### 4.4.1 定义事件

```typescript
// event-definitions.ts
import { EventV2 } from "@opencode-ai/core/event"

export const SessionCreated = EventV2.define({
  type: "session.created",
  version: 1,
  aggregate: "session",
  schema: {
    sessionID: Schema.String,
    title: Schema.String,
    createdBy: Schema.String,
  },
})
```

### 4.4.2 发布事件

```typescript
// session-service.ts
function createSession(title: string, user: string) {
  return Effect.gen(function* () {
    const session = yield* saveToDb(title, user)

    // 发布事件（不关心谁订阅了）
    yield* EventV2.Service.publish(SessionCreated, {
      sessionID: session.id,
      title: session.title,
      createdBy: user,
    })

    return session
  })
}
```

### 4.4.3 订阅事件

```typescript
// webhook-push.ts — 异步推送，不阻塞
function startWebhookPush(scope: Scope.Scope) {
  return Effect.gen(function* () {
    yield* Effect.forkIn(scope)(
      EventV2.Service.subscribe(SessionCreated).pipe(
        Stream.map((event) => ({
          type: "session.created",
          data: event.data,
        })),
        Stream.tap((message) => websocket.broadcast(message)),
        Stream.runDrain,
      )
    )
  })
}

// audit-log.ts — 必须在响应前写入
function initAuditLog() {
  return Effect.gen(function* () {
    yield* EventV2.Service.sync((event) =>
      auditLog.write({
        timestamp: Date.now(),
        type: event.type,
        data: event.data,
      })
    )
  })
}
```

### 4.4.4 时序图

```
SessionService          EventV2.Service           sync handlers          typed subscribers
     │                        │                        │                       │
     │  publish(Session       │                        │                       │
     │   Created, data)       │                        │                       │
     │───────────────────────▶│                        │                       │
     │                        │                        │                       │
     │                        │  for handler of        │                       │
     │                        │   syncHandlers:        │                       │
     │                        │    yield* handler(evt) │                       │
     │                        │───────────────────────▶│                       │
     │                        │                        │  auditLog.write()     │
     │                        │◀──────── ok ──────────│                       │
     │                        │                        │                       │
     │                        │  PubSub.publish(typed) │                       │
     │                        │──────────────────────────────────────────────▶│
     │                        │                        │                       │
     │                        │  PubSub.publish(all)   │                       │
     │                        │───────────────────────▶│──────────────────────▶│
     │                        │                        │                       │
     │◀────── Payload ───────│                        │                       │
     │  (发布完成, 包含       │                        │                       │
     │   同步 handler 结果)   │                        │                       │
```

---

## 4.5 EventV2 源码走读

```typescript
// packages/core/src/event.ts — 核心实现（标注行号）

// 事件类型注册表（全局）
export const registry = new Map<string, Definition>()   // line 32

// 定义事件类型
export function define(input) {                          // line 34
  const Data = Schema.Struct(input.schema)               // 从 schema 创建数据 Schema
  const Payload = Schema.Struct({                        // 完整的 Payload Schema
    id: ID,
    type: Schema.Literal(input.type),
    data: Data,
    // ... version, location, metadata
  })
  registry.set(input.type, definition)                   // 注册到全局表
  return definition
}

// 服务层实现（line 86-153）
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // 主 PubSub（接收所有事件）
    const all = yield* PubSub.unbounded<Payload>()
    // 类型级 PubSub 缓存
    const typed = new Map<string, PubSub.PubSub<Payload>>()
    // 同步 handler 列表
    const syncHandlers = new Array<Sync>()

    // 发布事件
    function publish(definition, data, options?) {
      return Effect.gen(function* () {
        // 1. 构建事件对象
        const event = { id: ID.create(), type: definition.type, data }
        // 2. 执行同步 handler
        for (const sync of syncHandlers) yield* sync(event)
        // 3. 推送到类型 PubSub
        const pubsub = typed.get(event.type)
        if (pubsub) yield* PubSub.publish(pubsub, event)
        // 4. 推送到全量 PubSub
        yield* PubSub.publish(all, event)
        return event
      })
    }

    // 按类型订阅（按需创建 PubSub）
    const subscribe = (definition) =>
      Stream.unwrap(
        getOrCreate(definition).pipe(
          Effect.map((pubsub) => Stream.fromPubSub(pubsub))
        )
      )
  })
)
```

---

## 4.6 Java vs Effect 事件体系对照

| Java (Spring) | EventV2 | 优势 |
|--------------|---------|------|
| `ApplicationEventPublisher` | `EventV2.Service.publish()` | 类型安全的事件定义 |
| `@EventListener` | `subscribe()` | 返回 Stream，可组合 |
| 同步执行（默认） | 支持 sync / subscribe 两种模式 | 按需选择同步或异步 |
| 事件需要新建类 | `define()` 一行定义 | 减少样板代码 |
| 错误传播到发布者 | sync 错误被 Effect 捕获 | 可精确处理 |
| 单个监听器 | `Stream.tap()` + `Stream.map()` | 可链式处理 |
| 无内置过滤 | `Stream.filter()` | 事件流就是 Stream |

---

## 4.7 本章小结

**核心要点**：
1. 发布者只负责 `publish()`，不关心谁订阅了
2. 三种订阅模式：`subscribe`（按类型）、`all`（全量）、`sync`（同步）
3. sync 用于"必须在响应前完成"的操作
4. subscribe 用于"后续处理即可"的操作
5. 事件定义、发布、订阅都是类型安全的

**最佳实践**：
```
定义事件 → 在模块顶层用 define()
发布事件 → 在业务代码中用 publish()
订阅事件 → 在应用初始化时注册，用 forkIn 启动独立 Fiber
同步钩子 → 仅在必要时使用（审计、关键状态更新）
```

**下一章预告**：AuthV2——多账户凭证管理。我们将看到如何用品牌类型和不可变更新来管理多个 AI 提供商的 API Key 和 OAuth Token。
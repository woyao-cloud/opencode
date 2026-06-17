# EventV2：解耦的事件总线

> **目标读者**：熟悉 Spring `ApplicationEvent` / `@EventListener` 或消息队列（RabbitMQ/Kafka）的开发者。
> **本章目标**：理解 EventV2 如何通过 PubSub 实现解耦，以及三种订阅模式各自的使用场景和取舍。

---

## 4.1 从一个真实的问题开始

想象一下你正在维护一个电商后端。每次用户下单后，系统需要做这些事情：

1. **扣减库存**——必须在响应返回前完成，否则可能超卖
2. **发送通知邮件**——可以异步，晚几秒没关系
3. **写入审计日志**——法规要求，必须在响应返回前写入
4. **更新推荐系统缓存**——可以异步，最终一致即可

在传统的 Spring 架构中，你可能把所有这些逻辑都写在 `OrderService.createOrder()` 方法里：

```java
// Java：所有逻辑揉在一个方法里
@Service
public class OrderService {
    public Order createOrder(OrderRequest request) {
        // 1. 保存订单到数据库
        Order order = orderRepository.save(request);

        // 2. 扣减库存
        inventoryService.deduct(order.getItems());

        // 3. 发送通知邮件
        emailService.sendOrderConfirmation(order);

        // 4. 写入审计日志
        auditService.log("order.created", order);

        // 5. 更新推荐缓存
        recommendationService.updateCache(order.getUserId());

        return order;
    }
}
```

这个写法有什么问题？

**问题 1：`createOrder` 方法干了太多事**——它不是一个"创建订单"方法，它是一个"创建订单 + 扣库存 + 发邮件 + 写日志 + 更新缓存"方法。方法名和实际行为不匹配。

**问题 2：新增需求要改已有代码**——如果下下周产品经理说"下单后还要同步到 ERP 系统"，你需要修改 `createOrder` 方法。这是一个已经上线运行的方法——每次修改都有风险。

**问题 3：错误处理复杂**——如果发邮件失败了，订单要不要回滚？如果缓存更新失败了，订单要不要取消？每个附加操作的失败策略都不同——有些是"必须成功"，有些是"失败了也无所谓"。混在一起很难区分。

### 事件驱动能解决这个问题

事件驱动的思路是：

> `createOrder` 只做一件事：创建订单。创建成功后，发布一个"订单已创建"事件。其他所有操作——扣库存、发邮件、写日志——都是这个事件的消费者。没有顺序依赖，每个消费者独立处理。

这就是 EventV2 的核心思想。

---

## 4.2 Spring 的事件机制有什么不足

Spring 也提供了事件机制：

```java
// Java Spring 事件
@Service
public class OrderService {
    @Autowired
    private ApplicationEventPublisher publisher;

    public Order createOrder(OrderRequest request) {
        Order order = saveToDb(request);

        // 发布事件
        publisher.publishEvent(new OrderCreatedEvent(order));

        return order;
    }
}

@Component
public class InventoryListener {
    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        inventoryService.deduct(event.getOrder().getItems());
    }
}

@Component
public class EmailListener {
    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        emailService.sendOrderConfirmation(event.getOrder());
    }
}
```

Spring 事件机制有几个限制：

1. **事件定义需要新建一个类**——`OrderCreatedEvent` 是一个空壳类，除了携带数据什么都不做。如果你有 20 种事件，就要建 20 个类。

2. **默认同步执行**——`publishEvent` 默认是同步的，所有 `@EventListener` 执行完才返回。如果想异步，需要加 `@Async`——但 `@Async` 有自己的一套坑（线程池配置、事务传播、异常处理）。

3. **无法组合**——你不能对事件流做 `filter`、`map`、`merge` 等操作。如果你想"只处理今天创建的订单"或者"把所有订单事件汇总"，你需要自己写代码遍历。

4. **错误传播隐式**——如果某个 `@EventListener` 抛出异常，默认情况下发布者也会收到异常。

EventV2 针对这些问题给出了不同的方案。

---

## 4.3 EventV2 的核心设计

### 4.3.1 一行定义事件

在 EventV2 中，定义一个事件不需要新建类——调用 `define()` 即可：

```typescript
// 定义事件——一行代码，既是类型又是 Schema
const OrderCreated = EventV2.define({
  type: "order.created",
  version: 1,
  aggregate: "order",
  schema: {
    orderId: Schema.String,
    userId: Schema.String,
    total: Schema.Number,
    items: Schema.Array(Schema.String),
  },
})
```

`define()` 返回的对象**既是 Schema（可以编解码）又是 Definition（可以发布和订阅）**。

### 4.3.2 类型安全贯穿始终

```typescript
// 发布——类型安全，数据必须匹配 schema
yield* EventV2.Service.publish(OrderCreated, {
  orderId: "ord_001",
  userId: "user_042",
  total: 299.00,
  items: ["item_001", "item_002"],
})

// 如果少传了一个字段：
yield* EventV2.Service.publish(OrderCreated, {
  orderId: "ord_001",
  // 忘了传 userId → 编译错误
})
```

### 4.3.3 三种消费方式

```typescript
// 方式 A：按类型订阅（90% 的场景）
EventV2.Service.subscribe(OrderCreated).pipe(
  Stream.tap((event) => inventoryService.deduct(event.data.items)),
  Stream.runDrain,
)

// 方式 B：全量流（审计、调试）
EventV2.Service.all().pipe(
  Stream.filter((event) => event.type.startsWith("order.")),
  Stream.tap((event) => auditLog.write(event)),
  Stream.runDrain,
)

// 方式 C：同步钩子（必须在发布完成前执行）
EventV2.Service.sync((event) =>
  auditLog.write(event)
)
```

**三种方式的本质区别**：

```
publish(event)
    │
    ├── sync handlers → 同步执行 → 发布者等待
    │    场景: "必须在响应返回前确保完成"
    │    示例: 扣减库存（否则可能超卖）
    │          写入审计日志（法规要求）
    │    代价: 阻塞发布者
    │
    └── typed subscribe → 异步 Stream → 发布者不等待
         场景: "可以稍后处理"
         示例: 发送通知邮件（晚几秒没关系）
               更新缓存（最终一致即可）
         优点: 不阻塞主流程
```

---

## 4.4 深入理解三种订阅模式

### 4.4.1 sync——"同步钩子"到底是做什么的

sync 是 EventV2 最独特的设计。它在发布者的**同一个 Effect 上下文**中执行：

```typescript
// sync handler 在 publish 内部被调用
function publish(definition, data, options?) {
  return Effect.gen(function* () {
    const event = buildEvent(definition, data)

    // 同步执行所有 sync handler
    for (const handler of syncHandlers) {
      yield* handler(event)  // 注意：和发布者在同一个 Effect 中
    }
    // 只有当所有 sync handler 都成功完成，
    // publish 才会继续往下走

    // 然后发布到异步 subscriber
    yield* PubSub.publish(typedPubsub, event)
    yield* PubSub.publish(allPubsub, event)

    return event
  })
}
```

**这种设计解决了什么问题？**

假设你的业务需求是："用户下单后，必须先扣减库存，然后才能告诉用户'下单成功'。"如果用异步 subscribe，在你通知用户"下单成功"时，库存可能还没扣完——在并发高的时候会超卖。

sync handler 保证：**在所有 sync handler 完成之前，publish 不会返回**。而 publish 返回后，上层代码才会通知用户。所以 sync handler 天然适合"必须在响应前完成"的操作。

**但如果某个 sync handler 失败了？**

```typescript
// sync handler 失败 → publish 返回这个失败
yield* EventV2.Service.publish(OrderCreated, data).pipe(
  Effect.catchTags({
    InventoryShortage: () => Effect.succeed(partialSuccess),
  })
)
```

因为 sync handler 和 publish 在同一个 Effect 中，失败会传播到 publish 的调用者。这让发布者有机会处理失败——比如回滚订单。

### 4.4.2 subscribe——"异步 Stream"要怎么用

subscribe 返回的是一个 `Stream`——Effect 版的"可组合事件流"。你可以对它做各种操作：

```typescript
// 基础用法：监听并处理
EventV2.Service.subscribe(OrderCreated).pipe(
  Stream.tap((event) => emailService.send(event.data)),
  Stream.runDrain,
)

// 组合用法：过滤 + 转换 + 聚合
EventV2.Service.subscribe(OrderCreated).pipe(
  Stream.filter((event) => event.data.total > 100),  // 只处理大额订单
  Stream.map((event) => ({ ...event.data, priority: "high" })),
  Stream.tap((event) => specialHandling(event)),
  Stream.runDrain,
)

// 多个事件类型合并
Stream.merge(
  EventV2.Service.subscribe(OrderCreated),
  EventV2.Service.subscribe(OrderCancelled),
).pipe(
  Stream.tap((event) => auditLog.write(event)),
  Stream.runDrain,
)
```

**重要的是**：subscribe 返回的 Stream 是**异步**的——它和发布者在不同的 Fiber 中运行。发布者不会等订阅者处理完成再返回。

### 4.4.3 什么时候用 sync，什么时候用 subscribe

| 场景 | 应该用 | 为什么 |
|------|--------|--------|
| 扣减库存 | `sync` | 必须在"下单成功"响应返回前确认库存扣减，否则并发下单会超卖 |
| 写入审计日志 | `sync` | 法规要求在响应返回前必须写入日志，不能"稍后再说" |
| 发送通知邮件 | `subscribe` | 邮件延迟几秒钟完全不影响用户体验 |
| 更新推荐缓存 | `subscribe` | 缓存最终一致即可——几秒钟的延迟用户感知不到 |
| 扣减用户余额 | `sync` | 和扣库存一样，必须在确认余额后才能说"支付成功" |
| 推送 WebSocket | `subscribe` | WebSocket 连接可能中断——不能因为推送失败就回滚订单 |

**一个简单的判断规则**：

> 问自己：如果这个操作失败了，应该回滚主操作吗？
> - 应该回滚 → sync（因为失败会传播到发布者）
> - 不应该回滚 → subscribe（失败不会影响发布者）

---

## 4.5 完整示例：订单事件处理

```typescript
// 1. 定义事件（放在一个单独的文件里）
const OrderCreated = EventV2.define({
  type: "order.created",
  version: 1,
  aggregate: "order",
  schema: {
    orderId: Schema.String,
    userId: Schema.String,
    total: Schema.Number,
    items: Schema.Array(Schema.String),
  },
})

// 2. 发布事件（在 OrderService 中）
function createOrder(items: string[], userId: string) {
  return Effect.gen(function* () {
    // 只有核心业务逻辑
    const order = yield* saveOrder(items, userId)

    // 发布事件——所有附加逻辑通过事件驱动
    yield* EventV2.Service.publish(OrderCreated, {
      orderId: order.id,
      userId,
      total: order.total,
      items,
    })

    return order
  })
}

// 3. 注册消费者（在应用启动时）

// 消费者 A：扣减库存（同步——必须在响应前完成）
yield* EventV2.Service.sync((event) => {
  if (event.type === "order.created") {
    return inventoryService.deduct(event.data.items)
  }
  return Effect.void
})

// 消费者 B：发送邮件（异步——可以稍后）
yield* Effect.forkIn(scope)(
  EventV2.Service.subscribe(OrderCreated).pipe(
    Stream.tap((event) => emailService.sendConfirmation(event.data.userId)),
    Stream.runDrain,
  )
)

// 消费者 C：更新推荐缓存（异步——最终一致即可）
yield* Effect.forkIn(scope)(
  EventV2.Service.subscribe(OrderCreated).pipe(
    Stream.tap((event) => recommendationService.updateCache(event.data.userId)),
    Stream.runDrain,
  )
)
```

现在如果产品经理说"下单后还要发短信通知"——你只需要新增一个消费者，不用改 `createOrder` 方法。

---

## 4.5.1 在 OpenCode 中的实际应用：SessionProcessor 的事件处理

现在让我们看看 EventV2 和 Stream 模式在 OpenCode 核心中的实际应用——`SessionProcessor` 处理 LLM 流的 `handleEvent` 函数。

在 `processor.ts:214-630`，有一个近 400 行的 `handleEvent` 函数。它不是用 EventV2 的 `subscribe`，而是用 **Stream.tap 直接处理 LLM 流的每个事件**：

```typescript
// processor.ts:721-736
yield* stream.pipe(
  Stream.tap((event) => handleEvent(event)),  // 每次流事件 → 触发 handleEvent
  Stream.takeUntil(() => ctx.needsCompaction), // 条件终止
  Stream.runDrain,
)
```

`handleEvent` 内部是一个 `switch`，处理 16 种事件类型：

```typescript
// processor.ts:214-630（简化）
const handleEvent = Effect.fnUntraced(function* (value: StreamEvent) {
  switch (value.type) {
    case "start":
      yield* status.set(ctx.sessionID, { type: "busy" })
      return

    case "reasoning-start":
      // 创建 ReasoningPart，记录开始时间
      ctx.reasoningMap[value.id] = { type: "reasoning", text: "" }
      yield* session.updatePart(ctx.reasoningMap[value.id])
      return

    case "reasoning-delta":
      // 追加推理文本
      ctx.reasoningMap[value.id].text += value.text
      yield* session.updatePartDelta({ ... })  // 推送到前端
      return

    case "text-start":
      // 创建 TextPart
      ctx.currentText = { type: "text", text: "" }
      yield* session.updatePart(ctx.currentText)
      return

    case "text-delta":
      // 追加文本（流式输出）
      ctx.currentText.text += value.text
      yield* session.updatePartDelta({ ... })
      return

    case "tool-call":
      // 处理工具调用
      yield* updateToolCall(value.toolCallId, { status: "running" })
      // 检测死循环
      if (isDoomLoop(value)) {
        yield* permission.ask({ permission: "doom_loop", ... })
      }
      return

    case "tool-result":
      // 工具执行完成，处理结果
      yield* completeToolCall(value.toolCallId, output)
      return

    case "finish-step":
      // 步骤结束，统计 token 用量
      ctx.assistantMessage.cost += usage.cost
      yield* session.updateMessage(ctx.assistantMessage)
      // 异步生成摘要
      yield* summary.summarize({ ... }).pipe(
        Effect.ignore, Effect.forkIn(scope)
      )
      return
  }
})
```

**这段代码体现了 Effect 的事件处理哲学**：

1. **每个事件类型是联合类型的一个分支**——`StreamEvent` 是一个联合类型，`switch(value.type)` 的每个 case 都是类型安全的
2. **不可变更新**——`ctx.currentText` 的更新通过 `session.updatePartDelta()` 持久化，而不是直接修改
3. **错误隔离**——每个 case 独立处理，一个 case 失败不会影响其他 case
4. **资源管理**——`summary.summarize()` 被 `forkIn(scope)`——scope 关闭时自动取消

**对比 Java 的事件处理**：

```java
// Java 中处理类似场景
// 通常是一个"大 Listener 接口" + "多个实现类"
// 或者是一个"大 if-else" + "回调"
// 没有类型安全的 switch，没有自动的资源管理
```

---

## 4.6 EventV2 源码走读

```typescript
// packages/core/src/event.ts — 核心实现
// 为什么这个文件只有 157 行？——因为核心概念很简单

// 1. 全局事件类型注册表
export const registry = new Map<string, Definition>()

// 2. 定义事件（返回 Schema + Definition 的组合体）
export function define(input) {
  const Data = Schema.Struct(input.schema)
  const PayloadSchema = Schema.Struct({
    id: ID,
    type: Schema.Literal(input.type),
    data: Data,
    // ... version, location, metadata（可选字段）
  })
  registry.set(input.type, definition)
  return definition
}

// 3. 服务实现
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // 主 PubSub：接收所有事件
    const all = yield* PubSub.unbounded<Payload>()
    // 类型级 PubSub：按类型分流
    const typed = new Map<string, PubSub.PubSub<Payload>>()
    // 同步 handler 列表
    const syncHandlers = new Array<Sync>()

    // 发布的核心逻辑
    function publish(definition, data, options?) {
      return Effect.gen(function* () {
        const event = buildEvent(definition, data)

        // ① 先执行同步 hook
        for (const sync of syncHandlers) {
          yield* sync(event)
        }

        // ② 再推送到类型订阅者
        const pubsub = typed.get(event.type)
        if (pubsub) yield* PubSub.publish(pubsub, event)

        // ③ 再推送到全量订阅者
        yield* PubSub.publish(all, event)

        return event
      })
    }
  })
)
```

**关键设计决策**：

1. **`syncHandlers` 是数组，不是 PubSub**——意味着 sync handler 的执行是有序的（按注册顺序），且发布者能感知到 handler 的失败

2. **`typed` 是按需创建的 PubSub**——如果一个事件类型从未被订阅，就不会创建对应的 PubSub，也不会浪费内存

3. **`all` 始终存在**——即使没有按类型订阅，全量流也能工作

---

## 4.7 三种订阅模式在 EventV2 Service 中的实现

```typescript
// 按类型订阅：第一次订阅时创建 PubSub
const subscribe = (definition) =>
  Stream.unwrap(
    getOrCreate(definition).pipe(
      Effect.map((pubsub) => Stream.fromPubSub(pubsub))
    )
  )

// 全量流：直接使用主 PubSub
const streamAll = () => Stream.fromPubSub(all)

// 同步钩子：注册到数组中
const sync = (handler) =>
  Effect.sync(() => {
    syncHandlers.push(handler)
    // 返回取消注册的函数
    return Effect.sync(() => {
      const index = syncHandlers.indexOf(handler)
      if (index >= 0) syncHandlers.splice(index, 1)
    })
  })
```

---

## 4.8 ⚠️ 常见错误

**错误 1：把长时间运行的操作放在 sync handler 中**

```typescript
// ❌ 错误：sync handler 中做了耗时操作
yield* EventV2.Service.sync((event) =>
  emailService.sendConfirmation(event.data.userId)
  // 发送邮件可能耗时 2-3 秒
)
// 发布者会被阻塞 2-3 秒——用户的"下单成功"响应也延迟 2-3 秒

// ✅ 正确：耗时操作放在 subscribe 中
yield* Effect.forkIn(scope)(
  EventV2.Service.subscribe(OrderCreated).pipe(
    Stream.tap((event) => emailService.sendConfirmation(event.data.userId)),
    Stream.runDrain,
  )
)
```

**错误 2：忘记 fork subscribe 的 Stream**

```typescript
// ❌ 错误：Stream.runDrain 会阻塞主流程
yield* EventV2.Service.subscribe(OrderCreated).pipe(
  Stream.runDrain  // runDrain 会等待流结束——但流永远不会结束！
)
// ← 永远不会执行到这里

// ✅ 正确：fork 到后台 Fiber
yield* Effect.forkIn(scope)(
  EventV2.Service.subscribe(OrderCreated).pipe(
    Stream.runDrain
  )
)
// ← 立即执行到这里
```

**错误 3：在 sync handler 中抛异常导致 publish 失败**

```typescript
// sync handler 的失败会传播到 publish 的调用者
// 如果某个 sync handler 不应该影响主流程——不要用 sync

// 一个真实的例子：审计日志服务挂了
yield* EventV2.Service.sync((event) =>
  auditService.write(event)  // 如果审计服务挂了 → publish 返回失败
)
// → 用户看到"下单失败"——但订单其实已经保存了
```

---

## 4.9 试试看

**练习**：使用 EventV2 实现一个"用户注册"的事件驱动流程。

需求：
1. 定义 `UserRegistered` 事件（包含 userId、email、注册时间）
2. 注册成功后发布事件
3. 注册以下消费者：
   - 发送欢迎邮件（异步）
   - 初始化用户配置（同步——必须在响应前完成）
   - 同步到 CRM 系统（异步）

**预期代码结构**：

```typescript
// 1. 定义事件
const UserRegistered = EventV2.define({
  type: "user.registered",
  schema: { userId: Schema.String, email: Schema.String, registeredAt: Schema.Number },
})

// 2. 注册服务
function registerUser(email: string) { ... }

// 3. 消费者
// 提示：哪个用 sync？哪个用 subscribe + forkIn？
```

---

## 4.10 本章小结

| Java Spring | EventV2 | 核心区别 |
|-----------|---------|----------|
| `ApplicationEventPublisher` | `EventV2.Service.publish()` | 类型安全的事件 Schema |
| `@EventListener` | `subscribe()` | 返回 Stream 可组合 |
| `@Async` + `@EventListener` | `subscribe()` + `forkIn` | Fiber 不需要线程池 |
| 默认同步 | 可选 sync / subscribe | 按需选择同步或异步 |
| 错误传播到发布者 | sync 会传播，subscribe 不会 | 更精细的错误隔离 |
| 事件类 `extends ApplicationEvent` | `define()` 一行 | 无需新建类 |

**核心要点**：
- sync handler：**"必须在响应前完成"**——阻塞发布者，失败会传播
- subscribe：**"可以稍后处理"**——不阻塞发布者，失败不影响主流程
- 发布者只关心 `publish()`，不关心谁在听

**下一章预告**：AuthV2——多账户凭证管理。我们将看到如何用品牌类型和不可变更新来管理多个 AI 提供商的 API Key 和 OAuth Token。
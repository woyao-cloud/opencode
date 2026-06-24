# ch14-advanced-concurrency — 高级并发原语

SynchronizedRef、Latch、FiberMap、ScopedCache 和 PubSub 是 Effect-TS 中的高级并发原语：

- **SynchronizedRef** — 并发安全的可变引用，基于 Semaphore 实现原子操作
- **Latch** — 一次性并发门闩，用于 Fiber 间的启动/停止协调
- **FiberMap** — 键值索引的 Fiber 集合，Scope 关闭时自动清理
- **ScopedCache** — 带作用域的异步缓存，支持 TTL、容量限制
- **PubSub** — 发布-订阅消息系统，支持多对多通信

## 安装

```bash
cd docs/Effect-ts/demos/ch14-advanced-concurrency
bun install
```

## 运行

```bash
# 场景 1: SynchronizedRef — get/set/update/modify/modifyEffect
bun run demo:syncref

# 场景 2: Latch — make/open/close/await/release/whenOpen
bun run demo:latch

# 场景 3: FiberMap — make/run/set/get/remove/awaitEmpty/join
bun run demo:fibermap

# 场景 4: ScopedCache — make/get/set/refresh/invalidate/TTL
bun run demo:cache

# 场景 5: PubSub — bounded/publish/subscribe/take/多策略
bun run demo:pubsub
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-synchronized-ref.ts` | SynchronizedRef 完整用法：make/get/set、update/updateAndGet/getAndUpdate、modify/modifyEffect、getAndSet/setAndGet、多 Fiber 并发安全演示 |
| `src/02-latch.ts` | Latch 完整用法：make/open/close/await、多等待者广播、close/open 循环、release vs open、whenOpen 条件执行、优雅关闭实战 |
| `src/03-fiber-map.ts` | FiberMap 完整用法：make/run、set/get、remove/clear、join/awaitEmpty、Scope 自动清理、makeRuntime、并发任务管理器 |
| `src/04-scoped-cache.ts` | ScopedCache 完整用法：make/get、set/has、refresh、invalidate/invalidateAll、TTL 时间过期、keys/values/entries、API 响应缓存实战 |
| `src/05-pubsub.ts` | PubSub 完整用法：bounded/publish/subscribe/take、多订阅者广播、并发发布消费、四种策略对比、takeAll/takeUpTo/takeBetween、状态查询、事件总线实战 |

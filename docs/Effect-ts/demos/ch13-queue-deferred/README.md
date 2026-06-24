# ch13-queue-deferred — Queue 与 Deferred 异步协调

Queue 和 Deferred 是 Effect-TS 中用于异步协调的核心原语：

- **Queue** — 异步队列，支持 bounded / unbounded / sliding / dropping 四种背压策略
- **Deferred** — 一次性异步信号，支持多个 Fiber 等待同一个结果
- **生产者-消费者** — Queue + Fiber 构建并发管道

## 安装

```bash
cd docs/Effect-ts/demos/ch13-queue-deferred
bun install
```

## 运行

```bash
# 场景 1: Queue 类型 — bounded/unbounded/sliding/dropping
bun run demo:types

# 场景 2: Queue 操作 — offer/take/takeAll/poll/capacity/size
bun run demo:ops

# 场景 3: Deferred — make/succeed/fail/await/poll
bun run demo:deferred

# 场景 4: 生产者-消费者模式 — Queue + Fiber + Deferred
bun run demo:producer
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-queue-types.ts` | Queue 四种类型：bounded（背压）、unbounded（无界）、sliding（滑动）、dropping（丢弃）+ Queue.make 通用构造器 |
| `src/02-queue-ops.ts` | Queue 操作大全：offer/offerAll、take/takeAll/takeN/takeBetween、poll、peek、size/isFull、end、clear、Enqueue/Dequeue 接口分离 |
| `src/03-deferred.ts` | Deferred 完整用法：make/succeed/fail、poll/isDone、单次赋值、Fiber 间通信、complete/completeWith、done/die/interrupt、多等待者 |
| `src/04-producer-consumer.ts` | 生产者-消费者实战：基础模式、多生产者、工作池、管道链、优雅关闭（Deferred 信号）、OpenCode 参考模式 |

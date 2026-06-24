# ch15-performance — 性能分析与优化

Effect-TS 程序的性能分析与优化：

- **开销分析** — Effect 创建开销、flatMap vs gen、Effect.all vs 顺序
- **Fiber 调度** — fork 开销、公平性、大规模并发
- **Cache 策略** — cached vs cachedWithTTL、命中率、LRU 驱逐
- **Stream 调优** — chunk 大小、buffer 大小、并发度、grouped 批量
- **微基准测试** — performance.now() 基准、预热、平均、标准差

## 安装

```bash
cd docs/Effect-ts/demos/ch15-performance
bun install
```

## 运行

```bash
# 场景 1: Effect 创建开销 — flatMap vs gen vs all vs sequential
bun run demo:overhead

# 场景 2: Fiber 调度 — fork 开销、公平性、大规模并发
bun run demo:fiber

# 场景 3: Cache 策略 — cached、cachedWithTTL、命中率对比
bun run demo:cache

# 场景 4: Stream 调优 — chunk 大小、buffer、并发度
bun run demo:stream

# 场景 5: 微基准测试 — performance.now()、预热、平均
bun run demo:benchmark
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-overhead-analysis.ts` | Effect 创建开销：succeed/sync/fail 创建成本、flatMap 链 vs Effect.gen、Effect.all 并发 vs 顺序 yield*、forEach 并发度、避免不必要的 Effect 包装 |
| `src/02-fiber-scheduling.ts` | Fiber 调度：fork 开销、公平性验证、大规模并发（1,000 Fiber）、Scope 管理、forkDaemon vs fork |
| `src/03-cache-strategy.ts` | Cache 策略：无缓存基线、cached 永久缓存、cachedWithTTL 带过期、命中率对比、LRU 容量驱逐 |
| `src/04-stream-tuning.ts` | Stream 调优：逐元素 vs Effect.forEach、grouped 批量处理、buffer 大小对吞吐量影响、并发度对比、Stream vs Array |
| `src/05-benchmark.ts` | 微基准测试框架：预热、多轮平均、标准差、Effect 创建/runSync/runPromise 微基准、Effect.all vs 顺序组合 |

# 第 10 章示例：Effect 模式集锦

本章通过四个可独立运行的 TypeScript 文件，演示 Effect-TS 中四种常用的编程模式：重试与调度、超时与竞态、批量操作、缓存与一次性操作。

## 学习路径

按以下顺序阅读和运行示例：

### 1. `01-retry-schedule.ts` — 重试与调度策略

**运行:** `bun run src/01-retry-schedule.ts`

展示 Effect-TS 的重试机制和 Schedule 组合器：
- `Effect.retry({times: n})` — 简单重试指定次数
- `Effect.retry + Schedule.recurs` — 显式调度重试
- `Schedule.recurs(1)` — 只重试一次
- `Schedule.exponential` — 指数退避
- `Schedule.spaced` — 固定间隔
- `Schedule.jittered` — 抖动（在间隔上添加随机偏移）
- 组合调度策略

**学习要点:** 理解 `Schedule` 是可组合的 — 你可以通过 `pipe` 将多个调度策略叠加，实现复杂的重试逻辑。

### 2. `02-timeout-race.ts` — 超时与竞态

**运行:** `bun run src/02-timeout-race.ts`

展示 Effect-TS 的超时和竞态模式：
- `Effect.timeout` — 超时控制
- `Effect.timeoutOrElse` — 超时时执行降级
- `Effect.race` — 两个 Effect 竞态（取第一个成功）
- `Effect.raceAll` — 多个 Effect 竞态
- `Effect.raceFirst` — 取第一个完成的（无论成功或失败）

**学习要点:** 理解 `race` 和 `raceFirst` 的区别 — race 在第一个失败时会等待下一个成功，raceFirst 在第一个完成时立即返回。

### 3. `03-batch-operations.ts` — 批量操作

**运行:** `bun run src/03-batch-operations.ts`

展示 Effect-TS 的批量处理模式：
- `Effect.forEach` — 遍历执行
- `Effect.forEach + concurrency` — 并发遍历
- `Effect.all` — 并行执行多个 Effect
- `Effect.all + concurrency` — 控制并发度
- `Effect.partition` — 分离失败和成功

**学习要点:** 理解 `concurrency` 参数如何控制并发度，以及 `partition` 如何容忍部分失败（注意：partition 返回 `[failures, successes]`）。

### 4. `04-cache-once.ts` — 缓存与一次性操作

**运行:** `bun run src/04-cache-once.ts`

展示 Effect-TS 的缓存和一次性执行模式：
- `Effect.cached` — 缓存 Effect 结果（永久缓存，返回嵌套 Effect）
- `Effect.cachedWithTTL` — 带过期时间的缓存（返回嵌套 Effect）
- 使用 `Ref` 实现"只执行一次"语义
- 手动缓存函数模式

**学习要点:** 理解 `Effect.cached` 返回 `Effect<Effect<A>>`（嵌套 Effect），需要先运行外层获取内层 Effect，然后多次运行内层。

## 前置知识

- 第 2 章：Effect 基础（`Effect.gen`、`Effect.pipe`、`Effect.succeed`、`Effect.fail`）
- 第 5 章：错误处理（`Effect.retry`、`Schedule`）

## 技术说明

- Effect 版本: `4.0.0-beta.65`
- 运行环境: Bun
- 每个 `.ts` 文件可独立运行，无相互依赖

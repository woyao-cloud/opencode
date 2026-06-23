# 第 2 章示例：Effect 类型入门

本章通过四个可独立运行的 TypeScript 文件，从"创建 Effect"到"组合 Effect"再到"运行 Effect"，逐步建立对 `Effect<R, E, A>` 类型系统的完整理解。

## 学习路径

按以下顺序阅读和运行示例：

### 1. `01-effect-types.ts` — Effect<R, E, A> 三参数模型

**运行:** `bun run src/01-effect-types.ts`

展示创建 Effect 的六种基本方式：
- `Effect.succeed` — 总是成功，R=never, E=never
- `Effect.fail` — 总是失败，R=never, A=never
- `Effect.sync` — 同步计算（假设不抛异常）
- `Effect.try` — 同步计算（自动捕获异常）
- `Effect.tryPromise` — Promise 转 Effect（捕获异常）
- `Effect.promise` — Promise 转 Effect（不捕获异常）

**学习要点:** 观察每种创建方式下 R/E/A 三个类型参数如何变化。理解 `tryPromise` 和 `promise` 的关键区别。

### 2. `02-pipe-and-flow.ts` — pipe 与 flow 组合

**运行:** `bun run src/02-pipe-and-flow.ts`

展示 Effect 的组合与变换：
- `pipe` — 管道组合（值 → 函数链）
- `flow` — 创建可复用的组合函数
- `Effect.map` — 变换成功值 A
- `Effect.flatMap` — 依赖前一个结果创建新 Effect
- `Effect.tap` — 副作用观察（不改变值）
- `Effect.andThen` — 顺序组合（忽略前一个结果）

**学习要点:** 理解类型如何在管道中传递 — map 只改 A，flatMap 可能扩大 E。

### 3. `03-generator-syntax.ts` — Effect.gen 与 yield*

**运行:** `bun run src/03-generator-syntax.ts`

展示生成器语法的核心用法：
- `Effect.gen(function* () { ... })` 基本语法
- `yield* effect` — 解包 Effect 获取值
- `yield* Effect.all([e1, e2])` — 并发执行
- `yield* Effect.forEach(items, fn)` — 批量处理
- 错误在 gen 中的自动传播

**学习要点:** 对比 gen/yield* 与 async/await 的异同。记住：gen 中必须用 yield*，不能用 await。

### 4. `04-running-effects.ts` — 运行 Effect

**运行:** `bun run src/04-running-effects.ts`

展示 Effect 的四种运行方式：
- `Effect.runSync` — 同步运行（要求 E=never）
- `Effect.runPromise` — 返回 Promise
- `Effect.runFork` — 返回 Fiber（异步不阻塞）
- `Effect.runPromiseExit` — 返回 Exit（永不抛异常）

**学习要点:** 理解每种运行方式的适用场景和限制条件。runPromiseExit 是最安全的方式。

## 前置知识

- 第 1 章：Effect-TS 的基本理念和 `Effect<R, E, A>` 的初步认知
- TypeScript 泛型基础
- Promise、async/await

## 技术说明

- Effect 版本: `4.0.0-beta.65`
- 运行环境: Bun
- 每个 `.ts` 文件可独立运行，无相互依赖

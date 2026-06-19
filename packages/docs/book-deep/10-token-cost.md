# 第 10 章：Token 与成本管理

> **本章目标**：理解 opencode 的 Token 统计与成本计算模型，掌握 `SynchronizedRef` 在原子累加中的应用，了解多提供商定价差异。
> **涉及文件**：`packages/opencode/src/session/session.ts`、`packages/core/src/plugin/models-dev.ts`、`packages/opencode/src/provider/provider.ts`
> **必备知识**：LLM 定价模型基础（input/output token 概念）

---

## 10.1 场景引入：每次 LLM 调用都在"烧钱"

使用 AI 编程工具不是免费的。每次 LLM 调用，提供商按 token 数量收费：

- **Input token**：发送给 LLM 的所有内容（系统提示 + 对话历史 + 用户输入）
- **Output token**：LLM 生成的所有内容（代码、解释、工具调用）
- **Cache read/write token**： Anthropic 的 prompt caching 机制——缓存命中的 input token 更便宜
- **Reasoning token**：Claude 的 extended thinking 产生的内部推理 token

一次典型的编程对话可能消耗：

- 系统提示：~5K token
- 对话历史：~50K token
- 用户输入：~500 token
- AI 输出：~2K token
- 工具结果：~10K token

按 Anthropic Claude Sonnet 的定价（input $3/MTok, output $15/MTok），一次对话可能花费 $0.20-$0.50。如果每天 50 次对话，月成本可能达到 $300-$750。

opencode 需要精确追踪每一笔消耗——不是为了"省钱"，而是为了让用户**知道钱花在哪里**。

---

## 10.2 核心概念

### Token 统计模型

`packages/opencode/src/session/session.ts` 的 `getUsage()` 函数返回一个 Session 的完整用量：

```typescript
// 简化的 Usage 结构
interface Usage {
  input: number        // 输入 token
  output: number       // 输出 token
  reasoning: number    // 推理 token（Claude thinking）
  cache_read: number   // 缓存读取 token（便宜）
  cache_write: number  // 缓存写入 token
  total: number        // 总计
}
```

每次 LLM 调用的 `finish-step` 事件到达时，opencode 从 AI SDK 的 `usage` 对象中提取这些数据，累加到 Session 的总用量中。

### 提供商定价模型

不同提供商的定价差异巨大。`packages/core/src/plugin/models-dev.ts` 的 `cost()` 函数根据模型和 token 类型计算费用：

| 提供商 | 模型 | Input 价格 ($/MTok) | Output 价格 ($/MTok) | 缓存价格 |
|--------|------|---------------------|----------------------|----------|
| Anthropic | Claude Opus 4 | $15 | $75 | cache_write $18.75, cache_read $1.50 |
| Anthropic | Claude Sonnet 4 | $3 | $15 | cache_write $3.75, cache_read $0.30 |
| OpenAI | GPT-4.1 | $2 | $8 | 无缓存 |
| OpenAI | GPT-4.1-mini | $0.40 | $1.60 | 无缓存 |
| Google | Gemini 2.5 Pro | $1.25 | $10 | 无缓存 |

注意 Anthropic 的缓存定价：**cache_write 比普通 input 贵**（因为写入缓存需要额外计算），但 **cache_read 只有普通 input 的 10%**。这意味着：重复使用相同系统提示的对话，成本会显著降低。

### 分 Tier 定价

部分模型支持大上下文（200K+ token），但大上下文版本价格更高。opencode 的 `cost()` 函数根据实际使用的上下文大小选择对应的 tier 价格。

---

## 10.3 Effect-TS 函数详解

### `SynchronizedRef.updateEffect` — 原子更新

```
类型签名（简化）:
  SynchronizedRef.updateEffect(ref, fn: (current: A) => Effect<A, E, R>): Effect<A, E, R>
```

**用途**：原子地读取、变换、写入引用。`updateEffect` 与 `modifyEffect` 类似，但变换函数返回的是新值（而非 `[result, newValue]` 对）。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：非原子累加
let totalTokens = 0
totalTokens += newTokens  // 并发环境下可能丢失更新

// Effect-TS：原子累加
yield* _(SynchronizedRef.updateEffect(ref, (current) =>
  Effect.succeed(current + newTokens)
))
```

**在 opencode 中的使用**：每次 `finish-step` 事件到达时，通过 `SynchronizedRef.updateEffect` 原子累加 token 用量。

### `Effect.map` / `Effect.flatMap` — 值转换

```
类型签名（简化）:
  Effect.map(effect, fn: (a: A) => B): Effect<B, E, R>
  Effect.flatMap(effect, fn: (a: A) => Effect<B, E2, R2>): Effect<B, E | E2, R | R2>
```

**用途**：`map` 转换成功值（纯函数），`flatMap` 链式调用下一个 Effect（可能失败、需要依赖）。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：.then() 链
const result = await fetchData().then(r => r.json()).then(j => j.value)

// Effect-TS：map + flatMap
const result = yield* _(fetchData().pipe(
  Effect.map(r => r.json()),
  Effect.flatMap(j => Effect.succeed(j.value)),
))
```

**在 opencode 中的使用**：成本计算管道中大量使用 `map` 和 `flatMap` 进行数据转换。

### `Effect.sync` / `Effect.try` — 包装同步操作

```
类型签名（简化）:
  Effect.sync<A>(fn: () => A): Effect<A, never, never>
  Effect.try<A, E>({ try: () => A, catch: (e: unknown) => E }): Effect<A, E, never>
```

**用途**：`sync` 包装不会失败的同步操作为 Effect。`try` 包装可能抛异常的同步操作，将异常转为类型化错误。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：同步操作
const result = JSON.parse(input)  // 可能抛异常，类型是 unknown

// Effect-TS：try 包装
const result = yield* _(Effect.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError({ cause: e }),
}))
// 如果失败，错误类型是 ParseError（不是 unknown）
```

**在 opencode 中的使用**：Drizzle ORM 的 Promise 查询通过 `Effect.try` 包装为 Effect。

### `Config.boolean` / `Config.string` / `Config.withDefault` — 声明式配置

```
类型签名（简化）:
  Config.boolean(name: string): Config<boolean>
  Config.string(name: string): Config<string>
  Config.withDefault(config, defaultValue: A): Config<A>
```

**用途**：声明式读取环境变量。`Config` 描述"需要什么配置"，`ConfigProvider` 提供实际值（环境变量、配置文件、命令行参数）。

**在 opencode 中的使用**：`RuntimeFlags.Service` 通过 `ConfigService` 定义了 20+ 配置项，如 `OPENCODE_AUTO_SHARE`、`OPENCODE_LOG_LEVEL`。

---

## 10.4 实现剖析

### Token 累加的原子性保证

每次 LLM 调用的 `finish-step` 事件携带本次调用的 token 用量。opencode 通过 `SynchronizedRef` 原子累加到 Session 总用量：

```typescript
// 简化的 token 累加逻辑
case "finish-step": {
  const usage = value.usage  // AI SDK 返回的用量数据
  yield* _(SynchronizedRef.updateEffect(sessionUsageRef, (current) =>
    Effect.succeed({
      input: current.input + usage.inputTokens,
      output: current.output + usage.outputTokens,
      reasoning: current.reasoning + (usage.reasoningTokens ?? 0),
      cache_read: current.cache_read + (usage.cachedInputTokens ?? 0),
      cache_write: current.cache_write + (usage.cacheWriteTokens ?? 0),
      total: current.total + usage.totalTokens,
    })
  ))
}
```

为什么需要 `SynchronizedRef`？因为在并发场景下（如多个子 Agent 同时运行），多个 `finish-step` 事件可能同时到达。普通的 `let` 变量累加在并发环境下会丢失更新（两个 Fiber 同时读取、同时加、同时写入 → 一个更新丢失）。`SynchronizedRef.updateEffect` 保证每次累加是原子的。

### 成本计算的提供商适配

`cost()` 函数根据提供商和模型查找对应的定价表：

```typescript
// 简化的 cost 计算
function cost(usage: Usage, model: Provider.Model): Decimal {
  const pricing = getPricing(model.providerID, model.modelID)
  return new Decimal(0)
    .plus(pricing.input.mul(usage.input))
    .plus(pricing.output.mul(usage.output))
    .plus(pricing.cache_read.mul(usage.cache_read))
    .plus(pricing.cache_write.mul(usage.cache_write))
}
```

使用 `Decimal.js`（而非原生 `number`）进行金额计算，避免浮点数精度问题。

### 用量告警

当 token 用量超过预设阈值时，opencode 通过 EventV2 发布告警事件。UI 层可以订阅这些事件，显示用量警告或建议用户开启压缩。

---

## 10.5 开发人员必备知识与技能

1. **LLM 定价模型理解** — 不同提供商的定价结构不同：有的按 token 类型分层（input/output/cache），有的按模型 tier 分层（标准/大上下文），有的按使用时段分层（高峰/非高峰）。理解定价模型是成本优化的前提。

2. **成本估算方法** — 粗略估算：英文 1 token ≈ 0.75 单词 ≈ 4 字符，中文 1 token ≈ 0.5 汉字。系统提示通常 3K-10K token，对话历史随对话长度线性增长。可以用 AI SDK 的 `countTokens` 函数精确计算。

3. **原子状态更新** — 在并发环境中，任何"读-改-写"操作都需要原子性保证。`SynchronizedRef` 是 Effect 提供的解决方案。在普通 TypeScript 中，你需要手动使用 Mutex 或原子操作（`Atomics`）。

4. **Decimal.js 精度** — 金额计算永远不要用原生 `number`（浮点数）。`0.1 + 0.2 !== 0.3` 是 JavaScript 的经典问题。`Decimal.js` 提供任意精度的十进制计算。

---

## 10.6 本章小结

- Token 统计分五类：input、output、reasoning、cache_read、cache_write
- 不同提供商定价差异巨大——Anthropic 有缓存分层，OpenAI 无缓存，Google 大上下文更便宜
- `SynchronizedRef.updateEffect` 保证并发环境下的 token 累加是原子的
- 成本计算使用 `Decimal.js` 避免浮点数精度问题
- `Effect.sync`/`Effect.try` 将同步操作包装为 Effect，`Config.*` 提供声明式配置读取
- 用量告警通过 EventV2 发布，UI 层订阅显示警告

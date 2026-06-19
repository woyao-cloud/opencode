# 第 11 章：限流与重试策略

> **本章目标**：理解 opencode 的限流处理与重试机制——从 HTTP 429 检测到 `Effect.Schedule` 自定义策略到三层超时架构。
> **涉及文件**：`packages/opencode/src/session/retry.ts`、`packages/core/src/aisdk.ts`
> **必备知识**：HTTP 协议基础、指数退避概念

---

## 11.1 场景引入：当 LLM 说"慢一点"

你正在密集使用 opencode——连续发送了 10 个请求。突然，第 11 个请求返回了：

```
HTTP 429 Too Many Requests
Retry-After: 30
```

LLM 提供商在告诉你："你太快了，等 30 秒再试。"

这是 AI 编程工具的日常。LLM 提供商都有速率限制（Rate Limit）——每分钟最多 N 个请求，每天最多 M 个 token。超过限制，请求被拒绝。

opencode 需要智能处理这种情况：

- **不是简单报错**——用户不想看到"请求失败，请重试"
- **不是立即重试**——立即重试只会再次被拒绝
- **不是无限重试**——某些错误（如 API Key 过期）重试没有意义
- **不同提供商不同策略**——Anthropic 的限流格式和 OpenAI 不同

---

## 11.2 核心概念

### HTTP 429 检测与解析

`packages/opencode/src/session/retry.ts` 的 `retryable()` 函数判断一个错误是否值得重试：

```typescript
// 简化的 retryable 逻辑
function retryable(error: APIError, provider: string): boolean {
  // 5xx 服务器错误 → 总是重试
  if (error.statusCode >= 500) return true

  // 429 限流 → 重试
  if (error.statusCode === 429) return true

  // 特定提供商的限流错误（响应体中的特殊标记）
  if (provider === "anthropic" && error.data?.type === "rate_limit_error") return true
  if (provider === "google" && error.data?.error?.code === 429) return true

  // API Key 过期、权限不足 → 不重试
  if (error.statusCode === 401 || error.statusCode === 403) return false

  // 其他 4xx → 不重试
  return false
}
```

关键原则：**5xx（服务器问题）和 429（限流）重试，4xx（客户端问题）不重试**。

### 指数退避

`retry.ts:34-40` 的 `delay()` 函数计算重试等待时间：

```typescript
export function delay(attempt: number, error?: MessageV2.APIError) {
  // 优先使用提供商返回的 retry-after 头
  if (error) {
    const headers = error.data.responseHeaders
    if (headers) {
      const retryAfterMs = headers["retry-after-ms"]
      if (retryAfterMs) {
        const parsedMs = Number.parseFloat(retryAfterMs)
        if (!Number.isNaN(parsedMs)) {
          return cap(parsedMs)  // 使用提供商建议的等待时间
        }
      }
    }
  }

  // 没有 retry-after 头 → 指数退避
  const base = 2000  // 2 秒
  const factor = 2   // 每次翻倍
  return cap(base * Math.pow(factor, attempt - 1))
  // attempt 1 → 2s, attempt 2 → 4s, attempt 3 → 8s, ...
}
```

`cap()` 函数限制最大延迟：有 `retry-after` 头时上限约 2.1B ms（32-bit 整数上限），无头时上限 30 秒。

### 三层超时架构

`packages/core/src/aisdk.ts:11-57` 的 `wrapSSE()` 实现了三层超时：

| 层级 | 超时范围 | 作用 |
|------|----------|------|
| **Chunk-level** | 秒级 | SSE 流中每个 chunk 的超时——如果 30 秒没有新 chunk，认为连接断开 |
| **Request-level** | 分钟级 | 整个 LLM 请求的超时——如果 5 分钟没有完成，中断请求 |
| **Session-level** | 小时级 | 整个会话的超时——由用户配置或 CLI 参数控制 |

三层超时各司其职：chunk-level 防止连接僵死，request-level 防止单次调用无限等待，session-level 防止整个对话无限运行。

---

## 11.3 Effect-TS 函数详解

### `Schedule` — 重试/重复策略抽象

```
类型签名（简化）:
  Schedule<Out, In, R> — 一个描述"何时以及如何重试/重复"的策略
```

**用途**：`Schedule` 是 Effect 的重试策略抽象。它不是"等待 N 秒"，而是"根据输入（尝试次数、错误信息）决定是否继续和等待多久"。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：手写重试循环
for (let i = 0; i < maxRetries; i++) {
  try {
    const result = await callLLM(prompt)
    return result
  } catch (e) {
    if (!isRetryable(e)) throw e
    await sleep(Math.pow(2, i) * 1000)  // 指数退避
  }
}

// Effect-TS：Schedule 声明式重试
const result = yield* _(callLLM(prompt).pipe(
  Effect.retry(Schedule.exponential("2 seconds"))
))
```

**在 opencode 中的使用**：`SessionRetry.policy` 是一个自定义 Schedule，根据提供商和错误类型动态决定重试策略。

### `Schedule.exponential` — 指数退避

```
类型签名（简化）:
  Schedule.exponential(base: DurationInput, factor?: number): Schedule<Duration, number>
```

**用途**：创建一个指数退避 Schedule。每次尝试的等待时间是 `base * factor^(attempt-1)`。

**在 opencode 中的使用**：`retry.ts` 的默认退避策略：base = 2s, factor = 2。

### `Schedule.fromStepWithMetadata` — 自定义动态 Schedule

```
类型签名（简化）:
  Schedule.fromStepWithMetadata(step: (meta) => Effect<[Out, Duration] | Cause.Done, never, never>): Schedule<Out, In>
```

**用途**：创建完全自定义的 Schedule。`step` 函数接收当前元数据（尝试次数、输入、累加器），返回"继续（新输出 + 等待时间）"或"停止（Done）"。

**在 opencode 中的使用**：`SessionRetry.policy` 使用 `fromStepWithMetadata` 实现提供商自适应的重试策略——检查 `retry-after` 头、解析提供商特定错误格式、动态计算等待时间。

### `Effect.retry` — 按策略重试

```
类型签名（简化）:
  Effect.retry(effect, schedule: Schedule<Out, E>): Effect<A, E, R>
```

**用途**：当 Effect 失败时，按 Schedule 定义的策略重试。如果 Schedule 决定停止（返回 Done），错误传播给调用者。

**在 opencode 中的使用**：`processor.ts:750` 的 `Effect.retry(SessionRetry.policy(...))` 是整个 LLM 调用的重试入口。

### `Duration` — 类型安全的时间间隔

```
类型签名（简化）:
  Duration.millis(n: number): Duration
  Duration.seconds(n: number): Duration
  Duration.minutes(n: number): Duration
```

**用途**：类型安全的时间间隔表示。与 `setTimeout` 的毫秒数不同，`Duration` 带有单位信息，避免"这个参数是毫秒还是秒"的混淆。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：数字容易混淆单位
setTimeout(fn, 2000)  // 2000 是毫秒？秒？需要查文档

// Effect-TS：Duration 带单位
Effect.retry(effect, Schedule.exponential(Duration.seconds(2)))
// 明确是 2 秒，不会混淆
```

**在 opencode 中的使用**：所有超时和重试等待时间都使用 `Duration`。

---

## 11.4 实现剖析

### SessionRetry.policy：提供商自适应的重试策略

`packages/opencode/src/session/retry.ts` 的 `SessionRetry.policy` 是一个复杂的自定义 Schedule：

```typescript
// 简化的 policy 逻辑
export function policy(opts: {
  provider: ProviderID
  parse: (error: unknown) => APIError | undefined
  set: (info: RetryInfo) => Effect<void>
}) {
  return Schedule.fromStepWithMetadata(
    Effect.succeed((meta) => {
      // 1. 解析错误
      const error = opts.parse(meta.input)
      if (!error) return Cause.done(meta.attempt)  // 无法解析 → 不重试

      // 2. 判断是否可重试
      const retry = retryable(error, opts.provider)
      if (!retry) return Cause.done(meta.attempt)  // 不可重试 → 停止

      // 3. 计算等待时间
      const wait = delay(meta.attempt, error)

      // 4. 更新 UI 状态（显示重试信息）
      return Effect.gen(function* (_) {
        yield* _(opts.set({
          attempt: meta.attempt,
          message: error.message,
          next: Date.now() + wait,
        }))
        return [meta.attempt, Duration.millis(wait)]
      })
    }),
  )
}
```

这个 Schedule 的决策树：

```
错误发生
  ├─ 无法解析为 APIError → 不重试（传播原始错误）
  ├─ 可解析但不可重试（401/403/4xx） → 不重试
  └─ 可重试（429/5xx）
       ├─ 有 retry-after 头 → 使用提供商建议的等待时间
       └─ 无 retry-after 头 → 指数退避（2s → 4s → 8s → ...）
```

### wrapSSE：三层超时的实现

`packages/core/src/aisdk.ts` 的 `wrapSSE()` 在 AI SDK 的 SSE 流上添加超时保护：

```typescript
// 简化的 wrapSSE 逻辑
function wrapSSE(stream: ReadableStream, opts: {
  chunkTimeout: Duration   // chunk 级超时
  requestTimeout: Duration // 请求级超时
}) {
  // 为每个 chunk 设置超时
  // 如果 chunkTimeout 内没有新 chunk → 中断流
  // 如果 requestTimeout 内流未完成 → 中断流
  // 合并用户取消信号 + chunk 超时 + 请求超时
}
```

---

## 11.5 开发人员必备知识与技能

1. **HTTP 限流协议** — HTTP 429 响应可能包含 `Retry-After` 头（秒数或日期）或 `retry-after-ms` 头（毫秒数，非标准但常用）。不同提供商的限流响应格式不同——Anthropic 在响应体中返回 `type: "rate_limit_error"`，OpenAI 返回 `error.code: "rate_limit_exceeded"`。

2. **指数退避算法** — 标准指数退避：`delay = base * factor^attempt`。生产环境中通常加上**抖动（Jitter）**——在计算出的延迟上添加随机偏移，避免多个客户端同时重试造成"惊群效应"。opencode 当前未使用抖动（因为单用户场景不需要）。

3. **超时分层设计** — 不要用单一超时覆盖所有场景。分层超时让每层有明确的职责：chunk-level 检测网络问题，request-level 检测服务卡顿，session-level 检测用户遗忘。

4. **重试安全性** — 重试非幂等操作（如写文件、执行 shell 命令）可能导致重复执行。opencode 的重试只针对 LLM 调用（幂等），工具执行不自动重试。

---

## 11.6 本章小结

- HTTP 429 和 5xx 错误触发重试，4xx 错误（401/403）不重试
- `delay()` 优先使用提供商返回的 `retry-after` 头，无头时使用指数退避（2s → 4s → 8s）
- `SessionRetry.policy` 通过 `Schedule.fromStepWithMetadata` 实现提供商自适应的动态重试
- 三层超时架构：chunk-level（秒级）、request-level（分钟级）、session-level（小时级）
- `Schedule` 是 Effect 的重试策略抽象，`Duration` 提供类型安全的时间表示
- 重试只针对幂等的 LLM 调用，工具执行不自动重试

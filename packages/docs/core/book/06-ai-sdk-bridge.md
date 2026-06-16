# AISDK：统一 AI 提供商接口

> **目标读者**：熟悉策略模式、工厂模式、SDK 集成开发的 Java 开发者。
> **本章目标**：理解 AISDK 如何用插件 + 缓存 + 超时保护来统一 20+ AI 提供商的接入。

---

## 6.1 问题概述

OpenCode 支持 20+ AI 提供商：

```
Anthropic (Claude)    → @ai-sdk/anthropic
OpenAI (GPT)          → @ai-sdk/openai
Google (Gemini)       → @ai-sdk/google
Mistral               → @ai-sdk/mistral
Groq                  → @ai-sdk/groq
... 以及 15+ 更多提供商
```

每个提供商都有自己的 SDK，初始化方式和参数都不同。直接在上层 LLM 服务中做这些适配会导致：

1. **重复初始化**：每次 LLM 调用都要重新 import + 配置 SDK
2. **缺少统一超时**：各提供商有不同的超时机制
3. **难以扩展**：新增一个提供商要改多处代码

### 6.1.1 Java 的策略模式

```java
// Java 策略模式
interface LanguageModelProvider {
    CompletableFuture<String> generate(String prompt);
}

class AnthropicProvider implements LanguageModelProvider {
    public CompletableFuture<String> generate(String prompt) {
        // Anthropic 特有的 API 调用
    }
}

class OpenAIProvider implements LanguageModelProvider {
    public CompletableFuture<String> generate(String prompt) {
        // OpenAI 特有的 API 调用
    }
}

// 工厂
class ProviderFactory {
    LanguageModelProvider create(String providerId) {
        switch (providerId) {
            case "anthropic": return new AnthropicProvider();
            case "openai":    return new OpenAIProvider();
            // 每新增一个提供商，就要修改这里
        }
    }
}
```

问题：**新增提供商要改 Factory 代码，违反开闭原则**。

### 6.1.2 AISDK 的插件方案

```typescript
// AISDK 用插件系统实现真正的开闭原则
const sdk = yield* plugin.trigger("aisdk.sdk", { model, options })

// 插件在外部注册：
// plugin/anthropic.ts
plugin.register("aisdk.sdk", ({ model, options }) => {
  const sdk = createAnthropic(options)
  return { sdk }
})

// 新增提供商 = 新增插件文件，不用改 AISDK 核心代码
```

---

## 6.2 AISDK 架构

```
LLM.Service (session/llm.ts)
    │
    │  AISDK.Service.language(model)
    ▼
┌───────────────────────────────────────────────────────────┐
│ AISDK (core/src/aisdk.ts)                                 │
│                                                           │
│  ① 计算缓存 key: providerID / modelID / variant          │
│  ② 查询缓存 → 命中直接返回                                │
│  ③ prepareOptions: timeout + baseURL + fetch 包装         │
│  ④ plugin.trigger("aisdk.sdk") → 获取 SDK 实例            │
│  ⑤ plugin.trigger("aisdk.language") → 获取 LanguageModel  │
│  ⑥ 缓存 LanguageModel → 返回                              │
└───────────────────────────────────────────────────────────┘
    │
    ▼
@ai-sdk/anthropic / @ai-sdk/openai / @ai-sdk/google / ...
```

---

## 6.3 缓存策略：为什么需要缓存

```typescript
// packages/core/src/aisdk.ts:120-167
// 缓存的核心实现
const languages = new Map<string, LanguageModelV3>()
const sdks = new Map<string, SDK>()

language: Effect.fn("AISDK.language")(function* (model) {
  const key = `${model.providerID}/${model.id}/${model.options.variant ?? "default"}`

  // 缓存命中 → 直接返回（耗时 0ms）
  const existing = languages.get(key)
  if (existing) return existing

  // 首次获取 → 动态 import + SDK 初始化（耗时 50-200ms）
  const options = prepareOptions(model, model.endpoint.package)
  const sdk = yield* plugin.trigger("aisdk.sdk", { model, options })
  const result = yield* plugin.trigger("aisdk.language", { model, sdk, options })
  const language = result.language ?? sdk.languageModel(model.apiID)

  // 缓存并返回
  languages.set(key, language)
  return language
})
```

**性能数据**：

| 操作 | 首次耗时 | 缓存命中耗时 |
|------|---------|-------------|
| 动态 import SDK | 30-80ms | 0ms |
| SDK 初始化 (createAnthropic) | 10-50ms | 0ms |
| LanguageModel 获取 | 1-5ms | 0ms |
| **合计** | **41-135ms** | **0ms** |

对 Java 开发者来说，这类似于：

```java
// Java 的 ConcurrentHashMap 缓存
private final Map<String, LanguageModel> cache = new ConcurrentHashMap<>();

public LanguageModel getLanguage(Model model) {
    return cache.computeIfAbsent(
        model.providerId() + "/" + model.id(),
        key -> {
            SDK sdk = loadSDK(model);       // 只执行一次
            return sdk.createLanguageModel(model);
        }
    );
}
```

---

## 6.4 SSE 超时保护

### 6.4.1 问题：Stream 卡死

AI 提供商的 API 响应是 SSE（Server-Sent Events）流。如果网络抖动或服务端异常，流可能在中间卡住——最后一个 chunk 发完了但连接没关闭。

默认的 `fetch` 没有 chunk-level timeout，会一直等到 TCP 超时（通常 2-5 分钟）。

### 6.4.2 AISDK 的解决方案

```typescript
// packages/core/src/aisdk.ts:11-57
function wrapSSE(res: Response, ms: number, ctl: AbortController): Response {
  // 只对 SSE 响应生效
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    return res
  }

  const reader = res.body.getReader()

  // 创建新的 Response，每个 chunk 都有超时
  const body = new ReadableStream({
    async pull(ctrl) {
      // 对每个 read() 设置 ms 超时
      const chunk = await Promise.race([
        reader.read(),
        timeout(ms).then(() => {
          const err = new Error("SSE read timed out")
          ctl.abort(err)
          throw err
        }),
      ])

      if (chunk.done) {
        ctrl.close()
        return
      }
      ctrl.enqueue(chunk.value)
    },

    async cancel(reason) {
      ctl.abort(reason)
      await reader.cancel(reason)
    },
  })

  return new Response(body, {
    headers: new Headers(res.headers),
    status: res.status,
    statusText: res.statusText,
  })
}
```

**工作原理**：

```
正常流:
  chunk1 → (100ms) → chunk2 → (50ms) → chunk3 → done ✓

卡死流（无 wrapSSE）:
  chunk1 → (100ms) → chunk2 → (卡死 5 分钟...) → TCP 超时 ✗

卡死流（有 wrapSSE）:
  chunk1 → (100ms) → chunk2 → (超过 chunkTimeout) → 抛超时异常 → 触发重试 ✓
```

---

## 6.5 自定义 fetch 包装

```typescript
// packages/core/src/aisdk.ts:59-99
function prepareOptions(model, pkg) {
  const options = {
    name: model.providerID,
    ...model.options.aisdk.provider,
  }

  // baseURL 覆盖
  if (model.endpoint.type === "aisdk" && model.endpoint.url) {
    options.baseURL = model.endpoint.url
  }

  // 包装 fetch
  const customFetch = options.fetch
  options.fetch = async (input, init?) => {
    const signals = [
      init?.signal,
      // chunk-level timeout
      chunkTimeout ? new AbortController() : undefined,
      // request-level timeout
      options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
    ].filter(Boolean)

    // 合并多个 abort signal
    if (signals.length > 1) {
      opts.signal = AbortSignal.any(signals)
    }

    const res = await (customFetch ?? fetch)(input, opts)

    // SSE 超时包装
    return wrapSSE(res, chunkTimeout, chunkAbortCtl)
  }

  return options
}
```

**超时层级**：

```
请求级超时 (timeout) ─── 整个请求的最大等待时间
    │
chunk 级超时 (chunkTimeout) ─── SSE 流中每个 chunk 的最大等待时间
    │
TCP 级超时 (底层) ─── 操作系统级的连接超时
```

---

## 6.6 插件扩展点

AISDK 通过 PluginV2 提供两个扩展点：

```typescript
// 扩展点 1: "aisdk.sdk"
// 用于获取或创建 AI SDK 实例
plugin.trigger("aisdk.sdk", { model, options })
// 返回 { sdk: SDK }

// 扩展点 2: "aisdk.language"
// 用于从 SDK 获取 LanguageModel
plugin.trigger("aisdk.language", { model, sdk, options })
// 返回 { language: LanguageModelV3 }
```

**如果这两个钩子都没有插件处理**，AISDK 会尝试默认路径：

```typescript
// 兜底逻辑（aisdk.ts:162）
const language = yield* Effect.sync(
  () => result.language ?? sdk.languageModel(model.apiID)
)
```

---

## 6.7 完整流程图

```
LLM.Service            AISDK.Service               Plugin                  @ai-sdk/anthropic
(session/llm)          (core/aisdk)                (core/plugin)            (npm package)
     │                      │                          │                        │
     │  language(model)     │                          │                        │
     │─────────────────────▶│                          │                        │
     │                      │                          │                        │
     │                      │  ① key = providerID /    │                        │
     │                      │        modelID / variant │                        │
     │                      │                          │                        │
     │                      │  ② languages.get(key)    │                        │
     │                      │     → miss               │                        │
     │                      │                          │                        │
     │                      │  ③ prepareOptions(       │                        │
     │                      │     model, package)      │                        │
     │                      │     → { baseURL, fetch,  │                        │
     │                      │       timeout, ... }     │                        │
     │                      │                          │                        │
     │                      │  ④ trigger("aisdk.sdk") │                        │
     │                      │─────────────────────────▶│                        │
     │                      │                          │  import("@ai-sdk/     │
     │                      │                          │    anthropic")        │
     │                      │                          │  → createAnthropic(   │
     │                      │                          │      options)         │
     │                      │                          │  → SDK 实例           │
     │                      │◀──── { sdk } ───────────│                        │
     │                      │                          │                        │
     │                      │  ⑤ trigger("aisdk.      │                        │
     │                      │     language")           │                        │
     │                      │─────────────────────────▶│                        │
     │                      │                          │  sdk.languageModel(   │
     │                      │                          │    model.apiID)       │
     │                      │                          │──────────────────────▶│  LanguageModelV3
     │                      │                          │◀── LanguageModelV3 ──│
     │                      │◀── { language } ────────│                        │
     │                      │                          │                        │
     │                      │  ⑥ languages.set(key,    │                        │
     │                      │     language)            │                        │
     │                      │                          │                        │
     │◀── LanguageModelV3 ─│                          │                        │
     │                      │                          │                        │
     │  ▲ 第二次调用:       │                          │                        │
     │  language(同模型)    │                          │                        │
     │─────────────────────▶│                          │                        │
     │                      │  languages.get(key)      │                        │
     │                      │  → HIT! 直接返回          │                        │
     │◀── (cached) ────────│  跳过 ③④⑤⑥              │                        │
```

---

## 6.8 本章小结

| Java 概念 | AISDK 对应 | 优势 |
|-----------|-----------|------|
| 策略模式 + 工厂模式 | `prepareOptions` + `trigger("aisdk.sdk")` | 无需修改核心代码即可新增提供商 |
| `ConcurrentHashMap` 缓存 | `Map<string, LanguageModelV3>` | 避免重复初始化 |
| `CompletableFuture.orTimeout()` | `wrapSSE` chunk-level timeout | 细粒度的超时控制 |
| `RestTemplate` 自定义拦截器 | 自定义 `fetch` 包装 | 统一的超时/请求体处理 |
| SPI / ServiceLoader | PluginV2 trigger | 无注册中心，纯函数组合 |

**下一章预告**：Catalog——模型目录管理器。它和 AuthV2 紧密协作，管理"有哪些模型可用"以及"用哪个模型"的问题。
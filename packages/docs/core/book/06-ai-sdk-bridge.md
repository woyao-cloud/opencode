# AISDK：统一 AI 提供商接口

> **目标读者**：熟悉策略模式、工厂模式、SDK 集成开发的 Java 开发者。
> **本章目标**：理解 AISDK 如何用插件 + 缓存 + 超时保护来统一 20+ AI 提供商的接入。

---

## 6.1 从一个真实的问题开始

想象一下你负责维护一个需要对接多个 AI 提供商的系统。

今天 Anhropic 发布了新模型，你要集成；下周 OpenAI 更新了 API，你要适配；下个月用户要求支持 Google Gemini，你又要加班。

每次新增一个提供商，你都要写类似的代码，但细节又不太一样：

```java
// Java：每新增一个提供商就要写一套类似的代码
public class AnthropicClient {
    public CompletableFuture<String> generate(String prompt) {
        // Anthropic 特有的 API 调用方式
        // API Key 在 header 中
        // 请求格式是 ...
    }
}

public class OpenAIClient {
    public CompletableFuture<String> generate(String prompt) {
        // OpenAI 特有的 API 调用方式
        // API Key 在 header 中（格式不同）
        // 请求格式是 ...（也不同）
    }
}
```

这些客户端的外面还要包一层"工厂"，根据用户配置选择正确的客户端：

```java
// Java 工厂模式
public class AIClientFactory {
    public AIClient create(String provider) {
        switch (provider) {
            case "anthropic": return new AnthropicClient();
            case "openai":    return new OpenAIClient();
            case "google":    return new GoogleClient();
            // 每新增一个提供商，就要改这里
            // 违反"开闭原则"——对扩展开放，对修改关闭
            default: throw new UnsupportedProviderException(provider);
        }
    }
}
```

这种架构有几个深层问题：

1. **新增提供商要改核心代码**——`switch` 语句在核心包中，每加一个提供商就要改它
2. **没有统一的超时控制**——每个客户端自己实现超时，风格不一致
3. **初始化开销**——每次使用都要 import + 初始化 SDK，浪费性能
4. **异常处理不一致**——Anthropic 的错误码和 OpenAI 的不同，每个客户端自己解析

### AISDK 的解决思路

AISDK 的做法是提供一个**抽象层**，把"获取 SDK 实例"和"获取 LanguageModel"两个操作抽象成插件钩子：

```
上层代码只调用: AISDK.Service.language(modelInfo)
AISDK 内部:
  1. 检查缓存 → 有就直接返回（耗时 0ms）
  2. 通过插件获取 SDK → import("@ai-sdk/anthropic")
  3. 通过插件获取 LanguageModel → sdk.languageModel("claude-sonnet-4")
  4. 缓存结果 → 下次调用秒回
  5. 返回 LanguageModelV3 实例
```

新增提供商 = 新增一个插件。**不需要改 AISDK 核心代码**。

---

## 6.2 AISDK 架构概览

```
open code/session/llm.ts (上层调用)
    │
    │  AISDK.Service.language(model)
    ▼
packages/core/src/aisdk.ts (抽象层)
    │
    ├── ① 计算缓存 key: "anthropic/claude-sonnet-4/default"
    ├── ② 查缓存 → 命中直接返回
    ├── ③ 准备选项 (timeout + baseURL + 自定义 fetch)
    ├── ④ 触发插件: "aisdk.sdk" → 获取 SDK 实例
    ├── ⑤ 触发插件: "aisdk.language" → 获取 LanguageModel
    ├── ⑥ 缓存并返回
    │
    ▼
@ai-sdk/anthropic / @ai-sdk/openai / @ai-sdk/google / ... (具体提供商 SDK)
```

**AISDK 层的价值**：它把"获取一个可用的 AI 模型"这个操作抽象成了 6 步——上层代码只需要调用 `language(model)`，不需要知道具体是哪家提供商、不需要关心缓存、不需要设置超时。

---

## 6.3 缓存：为什么能省下 50-200ms

### 6.3.1 一个容易被忽略的性能问题

每次调用 `@ai-sdk/anthropic` 获取 LanguageModel，背后发生的事情是：

```typescript
// 每次调用 AISDK.Service.language(model) 时（没有缓存）：
// 1. 动态 import("@ai-sdk/anthropic")          → 30-80ms
// 2. createAnthropic({ ... 配置 ... })         → 10-50ms
// 3. sdk.languageModel("claude-sonnet-4")      → 1-5ms
// 合计: 41-135ms
```

如果用户在一次对话中发送了 10 条消息，每次消息都要调用 LLM，那么没有缓存的情况下，光初始化就浪费了 0.4 到 1.3 秒。

而且你可能意识到了：**同一个模型在同一个对话中反复初始化，纯属浪费**。第一次初始化之后，后面每次都是同样的参数、同样的 SDK、同样的 LanguageModel。

### 6.3.2 缓存实现

```typescript
// packages/core/src/aisdk.ts
// 两个缓存 Map：
const languages = new Map<string, LanguageModelV3>()   // 缓存 LanguageModel
const sdks = new Map<string, SDK>()                     // 缓存 SDK 实例

language: Effect.fn("AISDK.language")(function* (model) {
  // 计算缓存 key
  const key = `${model.providerID}/${model.id}/${model.options.variant ?? "default"}`
  // 例如: "anthropic/claude-sonnet-4-20250514/default"

  // 缓存命中 → 直接返回，耗时 0ms
  const existing = languages.get(key)
  if (existing) return existing

  // 缓存未命中 → 完整初始化流程
  const options = prepareOptions(model, model.endpoint.package)
  const sdk = yield* plugin.trigger("aisdk.sdk", { model, options })
  const result = yield* plugin.trigger("aisdk.language", { model, sdk, options })
  const language = result.language ?? sdk.languageModel(model.apiID)

  // 缓存并返回
  languages.set(key, language)
  return language
})
```

**效果**：

| 调用次数 | 无缓存 | 有缓存 |
|----------|--------|--------|
| 第 1 次 | 41-135ms | 41-135ms |
| 第 2 次（同模型） | 41-135ms | **0ms** |
| 第 10 次 | 410-1350ms 累计 | **41-135ms 累计** |

对 Java 开发者来说，这就像：

```java
// Java 等价实现
private final Map<String, LanguageModel> cache = new ConcurrentHashMap<>();

public LanguageModel getLanguage(Model model) {
    String key = model.providerId() + "/" + model.id();
    // ConcurrentHashMap.computeIfAbsent 是线程安全的
    return cache.computeIfAbsent(key, k -> {
        SDK sdk = loadSDK(model);    // 只执行一次
        return sdk.createLanguageModel(model);
    });
}
```

---

## 6.4 SSE 超时保护：一个真实的事故

### 6.4.1 没有超时保护的后果

想象一下这个场景：你的用户在使用 OpenCode 和 AI 对话，AI 生成了大半的回复——突然，流卡住了。

最后一个 chunk 在屏幕上显示到一半，然后…… 什么都没了。没有错误提示，没有超时，就是卡住了。

用户开始狂按回车、刷新页面、重启应用。5 分钟后，流"突然"恢复了——因为 TCP 连接终于超时了。

这个问题的根源是：**AI 提供商的 SSE（Server-Sent Events）流可能因为网络抖动或服务端异常，在中间某个 chunk 处卡住**，而标准的 `fetch` API 没有 chunk-level 超时。

`fetch` 的超时是整个请求的超时——如果连接已经建立，正在接收流，`fetch` 的超时不会触发，因为它认为"连接还在活动中"。而 SSE 流的卡死发生在 chunk 之间——上一个 chunk 收到了，下一个 chunk 迟迟不发。`fetch` 认为"还在等数据"，不会中断。

### 6.4.2 AISDK 的解决方案

```typescript
// packages/core/src/aisdk.ts:11-57
// 核心思路：对 SSE 流中每个 chunk 的读取设置独立超时
function wrapSSE(res: Response, ms: number, ctl: AbortController): Response {
  // 只对 SSE 响应生效（非 SSE 的请求不管）
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    return res
  }

  const reader = res.body.getReader()

  // 创建一个新的 ReadableStream，每个 chunk 都有超时
  const body = new ReadableStream({
    async pull(ctrl) {
      // Promise.race：在"读下一个 chunk"和"超时"之间竞争
      const chunk = await Promise.race([
        reader.read(),                          // 读下一个 chunk
        timeout(ms).then(() => {
          const err = new Error("SSE read timed out")
          ctl.abort(err)                        // 中断原始流
          throw err                             // 抛超时异常，触发上层重试
        }),
      ])

      if (chunk.done) {
        ctrl.close()       // 流正常结束
        return
      }
      ctrl.enqueue(chunk.value)  // 推送到下游
    },

    async cancel(reason) {
      ctl.abort(reason)          // 如果下游取消了，也中断原始流
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

**工作原理的比喻**：

想象你在一家餐厅点了一份套餐（SSE 流）。服务员（fetch）每隔一会儿给你上一道菜（chunk）。

没有 wrapSSE 的情况：服务员上完前菜后，主菜迟迟不来。你等啊等，不好意思催。等了 5 分钟才发现厨房根本没在做你的菜——但服务员不告诉你，因为他"还在等"。

有 wrapSSE 的情况：服务员给你一个定时器。每道菜之间的等待时间不超过 `chunkTimeout` 毫秒。超时了，他就直接告诉经理（抛出异常）——"这个菜做不出来了，换一种方式处理"。

### 6.4.3 效果对比

```
正常流:
  chunk1 → (100ms) → chunk2 → (50ms) → chunk3 → done ✓

卡死流（无 wrapSSE）:
  chunk1 → (100ms) → chunk2 → (卡死 5 分钟...) → TCP 超时 → 用户放弃 ✗

卡死流（有 wrapSSE, chunkTimeout=10s）:
  chunk1 → (100ms) → chunk2 → (超过 10s) → SSE chunk timeout → 触发重试 ✓
```

---

## 6.5 自定义 fetch：不仅仅是超时

AISDK 的自定义 fetch 做了不止超时一件事。它提供了**完整的 HTTP 请求控制层**：

```typescript
function prepareOptions(model, pkg) {
  const options = {
    name: model.providerID,
    ...model.options.aisdk.provider,
  }

  // 1. 覆盖 baseURL（自托管网关等场景）
  if (model.endpoint.type === "aisdk" && model.endpoint.url) {
    options.baseURL = model.endpoint.url
  }

  // 2. 包装 fetch
  options.fetch = async (input, init?) => {
    // 2a. 合并多重超时信号
    const signals = [
      init?.signal,                           // 原始 abort signal
      chunkTimeout ? new AbortController() : undefined,  // chunk 级超时
      options.timeout ? AbortSignal.timeout(options.timeout) : undefined,  // 请求级超时
    ].filter(Boolean)

    if (signals.length > 1) {
      opts.signal = AbortSignal.any(signals)  // 任一超时都中断
    }

    // 2b. OpenAI 特定修复：删除请求体中的 id 字段
    // 某些版本的 OpenAI API 不接受 input 中包含 id
    if ((pkg === "@ai-sdk/openai" || pkg === "@ai-sdk/azure") && opts.body) {
      const body = JSON.parse(opts.body)
      if (body.store !== true && Array.isArray(body.input)) {
        for (const item of body.input) {
          if ("id" in item) delete item.id
        }
        opts.body = JSON.stringify(body)
      }
    }

    // 2c. 执行请求 + SSE 超时包装
    const res = await (customFetch ?? fetch)(input, opts)
    return wrapSSE(res, chunkTimeout, chunkAbortCtl)
  }

  return options
}
```

**超时层级**（三层防护）：

```
请求级超时 (options.timeout)
  → 整个 HTTP 请求的最大等待时间
  → 如果 AI 提供商一直不响应，在这个时间后中断
  ↓
Chunk 级超时 (chunkTimeout)
  → SSE 流中两个相邻 chunk 之间的最大等待时间
  → 如果流在中间卡住，在这个时间后中断
  ↓
TCP 级超时 (操作系统默认)
  → 最底层防线，通常 2-5 分钟
  → AISDK 几乎不会用到这一层
```

---

## 6.6 插件扩展：如何做到不改核心代码就新增提供商

### 6.6.1 两个扩展点

AISDK 通过 PluginV2 暴露两个扩展点：

```typescript
// 扩展点 1："aisdk.sdk"
// 作用：获取或创建 AI SDK 实例
// 调用时机：首次获取某个模型的 LanguageModel 时
// 期望返回：{ sdk: SDK }
const { sdk } = yield* plugin.trigger("aisdk.sdk", { model, options })

// 扩展点 2："aisdk.language"
// 作用：从 SDK 获取 LanguageModel 实例
// 调用时机：获取到 SDK 实例后
// 期望返回：{ language: LanguageModelV3 }
const { language } = yield* plugin.trigger("aisdk.language", { model, sdk, options })
```

### 6.6.2 插件如何工作

以 Anthropic 插件为例（简化）：

```typescript
// 外部插件：@opencode-ai/plugin-anthropic
const AnthropicPlugin = {
  name: "anthropic",

  hooks: {
    "aisdk.sdk": ({ model, options }) => {
      // 只处理本提供商的请求
      if (model.providerID !== "anthropic") return {}

      const sdk = createAnthropic(options)
      return { sdk }
    },

    "aisdk.language": ({ model, sdk }) => {
      if (model.providerID !== "anthropic") return {}

      const language = sdk.languageModel(model.apiID)
      return { language }
    },
  },
}
```

**新增一个提供商 = 新增一个插件文件，不改 AISDK 一行代码**。这和 Java 的 SPI（Service Provider Interface）思想一致，但实现更轻量——不需要 META-INF/services。

---

## 6.7 完整时序图

```
LLM.Service            AISDK.Service               Plugin                  @ai-sdk/anthropic
(session/llm)          (core/aisdk)                (core/plugin)            (npm 包)
     │                      │                          │                        │
     │  language({          │                          │                        │
     │   providerID:        │                          │                        │
     │   "anthropic",       │                          │                        │
     │   id: "claude-       │                          │                        │
     │   sonnet-4"          │                          │                        │
     │  })                  │                          │                        │
     │─────────────────────▶│                          │                        │
     │                      │                          │                        │
     │                      │  ① key =                 │                        │
     │                      │  "anthropic/claude-      │                        │
     │                      │   sonnet-4/default"     │                        │
     │                      │                          │                        │
     │                      │  ② languages.get(key)    │                        │
     │                      │  → miss（首次调用）      │                        │
     │                      │                          │                        │
     │                      │  ③ prepareOptions(       │                        │
     │                      │     model,               │                        │
     │                      │     "@ai-sdk/anthropic") │                        │
     │                      │     → { baseURL,         │                        │
     │                      │       fetch: wrapSSE,     │                        │
     │                      │       timeout }           │                        │
     │                      │                          │                        │
     │                      │  ④ 触发 "aisdk.sdk"     │                        │
     │                      │─────────────────────────▶│                        │
     │                      │                          │  import("@ai-sdk/     │
     │                      │                          │    anthropic")        │
     │                      │                          │  createAnthropic(     │
     │                      │                          │    options)           │
     │                      │                          │◀── SDK 实例 ─────────│
     │                      │◀──── { sdk } ───────────│                        │
     │                      │                          │                        │
     │                      │  ⑤ 触发 "aisdk.language"│                        │
     │                      │─────────────────────────▶│                        │
     │                      │                          │  sdk.languageModel(   │
     │                      │                          │    "claude-sonnet-4") │
     │                      │                          │──────────────────────▶│  create LanguageModel
     │                      │                          │◀── LanguageModelV3 ──│
     │                      │◀── { language } ────────│                        │
     │                      │                          │                        │
     │                      │  ⑥ languages.set(key,    │                        │
     │                      │     language)            │                        │
     │                      │  (缓存，下次直接返回)     │                        │
     │                      │                          │                        │
     │◀── LanguageModelV3 ─│                          │                        │
     │                      │                          │                        │
     │  ▲ 第二次调用        │                          │                        │
     │  (同 provider/       │                          │                        │
     │   同 model):         │                          │                        │
     │  language(...)       │                          │                        │
     │─────────────────────▶│                          │                        │
     │                      │  languages.get(key)      │                        │
     │                      │  → HIT!                  │                        │
     │                      │  (跳过 ③④⑤⑥)            │                        │
     │◀── (cached) ────────│                          │                        │
```

---

## 6.7 实战：LLM.Service —— 从 AISDK 到业务逻辑

AISDK 提供了统一的 LanguageModel 获取接口。真正的业务逻辑在 `packages/opencode/src/session/llm.ts` 中——`LLM.Service`。

### 6.7.1 LLM.Service 的依赖

```typescript
// session/llm.ts:62-74
const live: Layer.Layer<
  Service,
  never,
  Auth.Service | Config.Service | Provider.Service | Plugin.Service | Permission.Service | RuntimeFlags.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service        // 获取凭证
    const config = yield* Config.Service    // 读取配置
    const provider = yield* Provider.Service // 获取提供商信息
    const plugin = yield* Plugin.Service     // 触发插件钩子
    const perm = yield* Permission.Service   // 权限检查
    const flags = yield* RuntimeFlags.Service // 运行时标志

    // 在这些依赖之上构建 stream() 方法
    const run = Effect.fn("LLM.run")(function* (input) {
      // ...
    })
  })
)
```

**这里的关键**：LLM.Service 的 `R` 参数（依赖）有 6 个服务。Layer 链会保证在调用 `LLM.Service` 之前，所有 6 个服务都已经就绪。

### 6.7.2 stream() 内部流程

LLM.Service 的 `stream()` 方法内部使用 AISDK：

```typescript
// session/llm.ts 中的核心流程（简化）
const run = Effect.fn("LLM.run")(function* (input: StreamRequest) {
  // 1. 并行获取 4 个依赖
  const [language, cfg, item, info] = yield* Effect.all(
    [
      provider.getLanguage(input.model),     // → 内部调用 AISDK.Service.language()
      config.get(),
      provider.getProvider(input.model.providerID),
      auth.get(input.model.providerID),      // 获取认证信息
    ],
    { concurrency: "unbounded" },
  )

  // 2. 组装 system prompt
  const system = buildSystemPrompt(input)

  // 3. 触发插件钩子——允许插件修改参数
  const params = yield* plugin.trigger("chat.params", { ... }, defaultParams)

  // 4. 收集工具定义
  const tools = resolveTools(input)

  // 5. 调用 AI SDK streamText
  return streamText({
    model: language,       // 来自 AISDK 的 LanguageModelV3
    messages: systemMessages,
    tools: sortedTools,
    temperature: params.temperature,
    // ...
  })
})
```

**完整链路**：

```
LLM.Service.stream()
    │
    ├── provider.getLanguage() → AISDK.Service.language()
    │     ├── 查缓存 → HIT，直接返回 LanguageModelV3
    │     └── miss → trigger("aisdk.sdk") → trigger("aisdk.language") → 缓存
    │
    ├── Effect.all(...) ← 并行获取所有依赖
    │
    ├── plugin.trigger("chat.params") ← 插件修改请求参数
    │
    ├── resolveTools() ← 收集所有可用工具
    │
    └── streamText({ model, messages, tools }) ← AI SDK 核心调用
          │
          └── SSE stream ← 事件流 → handleEvent() → 流式输出到用户
```

---

## 6.8 ⚠️ 常见错误

**错误 1：没有配置 chunkTimeout 导致流卡死**

```bash
# 在 opencode.json 中配置
{
  "providers": {
    "anthropic": {
      "options": {
        "chunkTimeout": 10000  # 10 秒 chunk 超时
      }
    }
  }
}
# 如果不配——没有 chunk 级超时保护
```

**错误 2：混淆请求级超时和 chunk 级超时**

```
请求级超时 (timeout):        从发起请求到收到完整响应的最大时间
Chunk 级超时 (chunkTimeout): SSE 流中两个 chunk 之间的最大间隔

如果请求已建立，SSE 流正在接收数据——请求级超时不会触发
Chunk 级超时是专门针对"流卡在中间"这个场景的
```

---

## 6.9 本章小结

| Java 概念 | AISDK 对应 | 核心区别 |
|-----------|-----------|----------|
| 策略模式 + 工厂模式 | `prepareOptions` + `trigger("aisdk.sdk")` | 插件可动态注册，不改核心代码 |
| `ConcurrentHashMap` 缓存 | `Map<string, LanguageModelV3>` | 避免每次重复 import SDK |
| `CompletableFuture.orTimeout()` | `wrapSSE` chunk 级超时 | 细粒度控制流中的每个 chunk |
| `RestTemplate` 拦截器 | 自定义 `fetch` 包装 | 可同时处理多个 abort signal |
| SPI / ServiceLoader | PluginV2 trigger | 无注册中心，纯函数组合 |

**试试看**：在 AISDK 中新增一个模拟提供商（mock provider），用它测试 LanguageModel 的获取流程。
1. 定义一个新的 model，providerID 设为 `"mock"`
2. 注册一个插件处理 `aisdk.sdk` 钩子，返回一个模拟的 SDK
3. 触发 `AISDK.Service.language()`，验证缓存是否生效
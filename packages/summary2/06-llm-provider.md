# OpenCode LLM 提供商集成设计文档

## 1. 概述

OpenCode 通过两层抽象实现多 LLM 提供商支持：

1. **@opencode-ai/llm**（`packages/llm/`）— 高层抽象：提供商路由、协议、认证、传输、缓存、工具运行时
2. **@opencode-ai/core/aisdk.ts**（`packages/core/src/aisdk.ts`）— 低层抽象：包装 Vercel AI SDK 的 20+ 提供商包

```
SessionProcessor (opencode/session/llm.ts)
        │
        ▼
    @opencode-ai/llm
    ┌──────────────────────────────┐
    │ Route → Protocol → Auth     │
    │ Framing → Transport → Cache │
    │ Tool/ToolRuntime            │
    └──────────┬───────────────────┘
               │
               ▼
    @opencode-ai/core/aisdk.ts
    ┌──────────────────────────────┐
    │ streamText() wrapper         │
    │ 20+ @ai-sdk/* 提供商         │
    └──────────┬───────────────────┘
               │
               ▼
    AI Provider API (Anthropic/OpenAI/Google/...)
```

---

## 2. @opencode-ai/llm 包结构

| 模块 | 文件 | 职责 |
|------|------|------|
| Route | `src/route.ts` | 模型到提供商的映射路由 |
| Protocol | `src/protocol/` | 各提供商协议实现 |
| Auth | `src/auth/` | 认证处理（API Key / OAuth） |
| Framing | `src/framing/` | 响应帧解析 |
| Transport | `src/transport/` | HTTP 传输层 |
| Tool | `src/tool.ts` | 工具接口定义 |
| Cache | `src/cache/` | 响应缓存 |

### 2.1 Provider 选择 → 路由 → 流式响应时序

```
SessionProcessor        LLM.Service          Route               Protocol            Auth              Provider API
     │                      │                  │                    │                  │                    │
     │  stream(input)       │                  │                    │                  │                    │
     │─────────────────────▶│                  │                    │                  │                    │
     │                      │  解析 modelID    │                    │                  │                    │
     │                      │  → provider      │                    │                  │                    │
     │                      │─────────────────▶│                    │                  │                    │
     │                      │                  │  Route.resolve()   │                  │                    │
     │                      │                  │  (model → provider │                  │                    │
     │                      │                  │   → endpoint)     │                  │                    │
     │                      │                  │───────────────────▶│                  │                    │
     │                      │                  │                    │  Protocol.init()  │                    │
     │                      │                  │                    │  (设置请求格式)   │                    │
     │                      │                  │                    │──────────────────▶│                    │
     │                      │                  │                    │                    │  Auth.getCreds()   │
     │                      │                  │                    │                    │──────────────────▶│
     │                      │                  │                    │                    │  (API Key / Token) │
     │                      │                  │                    │                    │                    │
     │                      │                  │                    │◀── ready ◀─────────│◀── ok ◀───────────│
     │                      │                  │◀── ready ◀────────│                    │                    │
     │                      │◀── endpoint ◀───│                    │                    │                    │
     │                      │                  │                    │                    │                    │
     │                      │  Transport.send()│                    │                    │                    │
     │                      │──────────────────────────────────────────────────────────▶│                    │
     │                      │                  │                    │                    │  HTTP POST + SSE   │
     │                      │                  │                    │                    │                    │
     │                      │◀── textDelta ◀──│────────────────────│────────────────────│◀── SSE events ◀───│
     │                      │  (HTML 格式)     │                    │                    │                    │
     │                      │                  │                    │                    │                    │
     │                      │  Framing.parse()  │                    │                    │                    │
     │                      │  (解析响应帧)     │                    │                    │                    │
     │                      │                  │                    │                    │                    │
     │◀── textDelta ◀──────│                  │                    │                    │                    │
     │◀── toolCall ◀───────│                  │                    │                    │                    │
     │◀── finish ◀─────────│                  │                    │                    │                    │
```

---

## 3. @opencode-ai/core/aisdk.ts — AI SDK 包装层

### 3.1 提供商初始化

```typescript
// 包装后的统一调用入口
export function streamText(options: {
  model: string | LanguageModel
  messages: Message[]
  tools?: Record<string, Tool>
  maxSteps?: number
  // ...
}): Stream {
  // 根据 model 自动选择对应的 @ai-sdk/* 提供商
}
```

### 3.2 支持的 AI SDK 提供商

| 提供商 | SDK 包 | 初始化函数 |
|--------|--------|-----------|
| Anthropic | `@ai-sdk/anthropic` | `createAnthropic()` |
| OpenAI | `@ai-sdk/openai` | `createOpenAI()` |
| Google | `@ai-sdk/google` | `createGoogleGenerativeAI()` |
| Vertex AI | `@ai-sdk/google-vertex` | `createVertex()` |
| Mistral | `@ai-sdk/mistral` | `createMistral()` |
| Cohere | `@ai-sdk/cohere` | `createCohere()` |
| Groq | `@ai-sdk/groq` | `createGroq()` |
| Perplexity | `@ai-sdk/perplexity` | `createPerplexity()` |
| Azure | `@ai-sdk/azure` | `createAzure()` |
| Bedrock | `@ai-sdk/amazon-bedrock` | `createBedrock()` |
| Alibaba | `@ai-sdk/alibaba` | `createAlibabaCloud()` |
| Cerebras | `@ai-sdk/cerebras` | `createCerebras()` |
| DeepInfra | `@ai-sdk/deepinfra` | `createDeepInfra()` |
| Together AI | `@ai-sdk/togetherai` | `createTogetherAI()` |
| xAI (Grok) | `@ai-sdk/xai` | `createXAI()` |
| OpenRouter | `@openrouter/ai-sdk-provider` | `createOpenRouter()` |
| Venice AI | `venice-ai-sdk-provider` | `createVenice()` |
| GitLab AI | `gitlab-ai-provider` | `createGitLabAI()` |
| AI Gateway | `ai-gateway-provider` | `createAIGateway()` |

---

## 4. 流式响应处理

### 4.1 streamText 内部调用链

```
LLM.Service              aisdk.ts (core)          @ai-sdk/provider        Provider HTTP API
     │                      │                          │                       │
     │  streamText()        │                          │                       │
     │─────────────────────▶│                          │                       │
     │                      │  resolve language model  │                       │
     │                      │  (modelId → provider)   │                       │
     │                      │                          │                       │
     │                      │  streamText({            │                       │
     │                      │    model,                │                       │
     │                      │    messages,             │                       │
     │                      │    tools,                │                       │
     │                      │    maxSteps: 0,          │                       │
     │                      │    onStepFinish,         │                       │
     │                      │  })                      │                       │
     │                      │─────────────────────────▶│                       │
     │                      │                          │  doStream()           │
     │                      │                          │──────────────────────▶│
     │                      │                          │                       │  HTTP POST
     │                      │                          │                       │  + SSE response
     │                      │                          │◀── raw SSE stream ───│
     │                      │                          │                       │
     │                      │  textDelta event         │                       │
     │                      │◀─────────────────────────│                       │
     │◀── textDelta ◀──────│                          │                       │
     │                      │                          │                       │
     │                      │  toolCall event          │                       │
     │                      │◀─────────────────────────│                       │
     │◀── toolCall ◀───────│                          │                       │
     │                      │                          │                       │
     │                      │  finish event            │                       │
     │                      │◀─────────────────────────│                       │
     │◀── finish ◀─────────│                          │                       │
```

---

## 5. 重试与回退策略

### 5.1 重试流程

```
LLM.Service              Provider API             Retry Logic
     │                      │                        │
     │  stream()            │                        │
     │─────────────────────▶│                        │
     │                      │                        │
     │                      │  HTTP 429 / 5xx        │
     │                      │  (rate limit / error)  │
     │                      │◀───────────────────────│
     │                      │                        │
     │  ERROR                │                        │
     │◀─────────────────────│                        │
     │                      │                        │
     │  Retry(attempt=1)    │                        │
     │  wait → 1s (backoff) │                        │
     │─────────────────────▶│                        │
     │                      │  重试请求              │
     │                      │──────────────────────▶│
     │                      │                        │
     │                      │  HTTP 429              │
     │                      │◀───────────────────────│
     │                      │                        │
     │  Retry(attempt=2)    │                        │
     │  wait → 2s (backoff) │                        │
     │─────────────────────▶│                        │
     │                      │  重试请求              │
     │                      │──────────────────────▶│
     │                      │                        │
     │                      │  HTTP 200 + SSE        │
     │                      │◀───────────────────────│
     │◀── stream ◀─────────│                        │
```

### 5.2 提供商回退流程

```
LLM.Service              Provider A              Provider B (fallback)
     │                      │                        │
     │  stream("claude-     │                        │
     │   sonnet")           │                        │
     │─────────────────────▶│                        │
     │                      │                        │
     │                      │  HTTP 503              │
     │                      │  (unavailable)         │
     │                      │◀───────────────────────│
     │                      │                        │
     │  fallback → "gpt-4o" │                        │
     │──────────────────────────────────────────────▶│
     │                      │                        │
     │                      │                        │  HTTP 200 + SSE
     │                      │                        │◀───────────────────
     │◀── stream ◀─────────│────────────────────────│
```

---

## 6. 认证管理

### 6.1 API Key 管理

```typescript
// packages/opencode/src/provider/ 中的管理逻辑
// Auth.Service (@opencode-ai/core) 提供凭证持久化

// 认证获取流程:
// 1. 从配置读取 API Key
// 2. 如果配置中有 OAuth token，检查过期
// 3. 过期则刷新 token
// 4. 返回有效凭证给 AI SDK
```

### 6.2 认证调用链

```
Provider.Service         Auth.Service (core)        Storage                  External Auth
     │                        │                        │                        │
     │  getCredentials()      │                        │                        │
     │───────────────────────▶│                        │                        │
     │                        │  Config.get()           │                        │
     │                        │───────────────────────▶│                        │
     │                        │◀── API Key / Token ◀──│                        │
     │                        │                        │                        │
     │                        │  Token 过期？           │                        │
     │                        │  if expired:           │                        │
     │                        │  refreshToken()        │                        │
     │                        │───────────────────────────────────────────────▶│
     │                        │                        │                        │
     │                        │◀── new token ◀─────────│◀── OAuth refresh ◀───│
     │                        │                        │                        │
     │                        │  Config.set()           │                        │
     │                        │───────────────────────▶│                        │
     │                        │                        │                        │
     │◀── credentials ◀─────│                        │                        │
```

---

## 7. 提供商配置数据流

```
User Config              Config.Service           Provider.Service         LLM.Stream
(opencode.json)                                                                  
     │                        │                        │                        │
     │  {                     │                        │                        │
     │   "providers": {       │                        │                        │
     │    "anthropic": {      │                        │                        │
     │     "apiKey": "..."    │                        │                        │
     │    }                   │                        │                        │
     │   }                    │                        │                        │
     │───────────────────────▶│                        │                        │
     │                        │  Config.load()         │                        │
     │                        │  → 解析 provider 配置   │                        │
     │                        │───────────────────────▶│                        │
     │                        │                        │  Provider.register()   │
     │                        │                        │  (初始化 AI SDK 提供商) │
     │                        │                        │                        │
     │                        │                        │  session 中引用 model  │
     │                        │                        │  "claude-sonnet-4"     │
     │                        │                        │───────────────────────▶│
     │                        │                        │                        │
     │                        │                        │  → Route.resolve()     │
     │                        │                        │  → Anthropic provider  │
     │                        │                        │  → streamText()        │
```
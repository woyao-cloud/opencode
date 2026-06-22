# @opencode/Provider — AI 模型 Provider 管理
> 源文件: `opencode/packages/opencode/src/provider/provider.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/provider/provider.ts`

## 概述

`@opencode/Provider` 是 OpenCode 的 **AI 模型 Provider 管理中心**，负责发现、加载、配置和缓存所有 AI 模型 Provider。它从多个来源（models.dev 目录、环境变量、认证服务、配置文件、插件）聚合 Provider 信息，按优先级合并配置，管理 SDK 实例的延迟加载和缓存，提供模型查找、模糊匹配、默认模型选择等功能。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取 provider 配置、disabled_providers、enabled_providers、small_model、model |
| `Auth` | `@opencode/Auth` | 获取 API key 认证信息 |
| `Env` | `@opencode/Env` | 读取环境变量（API key 等） |
| `Plugin` | `@opencode/Plugin` | 加载插件 provider 定义 |
| `ModelsDev` | `@opencode-ai/core/models` | models.dev 模型目录数据 |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 读取最近模型状态文件 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 实验性功能标志 |

```typescript
// provider.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service
  const config = yield* Config.Service
  const auth = yield* Auth.Service
  const env = yield* Env.Service
  const plugin = yield* Plugin.Service
  const modelsDevSvc = yield* ModelsDev.Service
  const runtimeFlags = yield* RuntimeFlags.Service
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>>                         // 所有已激活的 Provider
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info>               // 获取单个 Provider
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model, ModelNotFoundError>  // 获取模型
  readonly getLanguage: (model: Model) => Effect.Effect<LanguageModelV3, ModelNotFoundError>               // 获取语言模型实例
  readonly closest: (providerID: ProviderID, query: string[]) => Effect.Effect<...>   // 模糊匹配模型
  readonly getSmallModel: (providerID: ProviderID) => Effect.Effect<Model | undefined> // 获取轻量模型
  readonly defaultModel: () => Effect.Effect<{ providerID: ProviderID; modelID: ModelID }>                  // 默认模型
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Provider") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 列出所有 Provider
yield* Provider.Service.list()

// 获取语言模型
const language = yield* Provider.Service.getLanguage(model)
```

## 数据结构

### Provider Info

```typescript
export const Info = Schema.Struct({
  id: ProviderID,                                    // Provider 标识
  name: Schema.String,                               // 显示名称
  source: Schema.Literals(["env", "config", "custom", "api"]),  // 配置来源
  env: Schema.Array(Schema.String),                  // 环境变量名列表（API key）
  key: optionalOmitUndefined(Schema.String),         // API key 值
  options: Schema.Record(Schema.String, Schema.Any), // Provider 选项
  models: Schema.Record(Schema.String, Model),       // 模型映射
})
```

### Model

```typescript
export const Model = Schema.Struct({
  id: ModelID,                                       // 模型标识
  providerID: ProviderID,                            // 所属 Provider
  api: ProviderApiInfo,                              // API 信息（id, url, npm）
  name: Schema.String,                               // 显示名称
  family: optionalOmitUndefined(Schema.String),      // 模型家族
  capabilities: ProviderCapabilities,                // 能力（temperature, reasoning, toolcall 等）
  cost: ProviderCost,                                // 成本（input, output, cache, tiers）
  limit: ProviderLimit,                              // 限制（context, input, output）
  status: ModelStatus,                               // 状态（active, deprecated, alpha）
  options: Schema.Record(Schema.String, Schema.Any), // 模型选项
  headers: Schema.Record(Schema.String, Schema.String), // 自定义 headers
  release_date: Schema.String,                       // 发布日期
  variants: ...,                                     // 模型变体
})
```

## Provider 配置加载流程

Provider 的配置加载按以下优先级从低到高合并：

```
1. models.dev 目录 → 基础数据（所有已知 Provider 和模型）
   ├── 插件 provider 钩子 → 修改模型列表
   ├── 配置文件 (config.provider) → 添加/覆盖模型配置
   ├── 环境变量 → API key 注入
   ├── 认证服务 (auth) → API key 注入
   ├── 插件 auth 钩子 → OAuth/自定义认证选项
   ├── custom() 函数 → 内置 Provider 的特殊处理
   └── 配置文件（二次应用）→ 最终覆盖
2. Provider 过滤：
   ├── disabled_providers → 移除
   ├── enabled_providers 白名单 → 移除非白名单
   ├── 模型状态过滤 → 移除 alpha/deprecated
   ├── blacklist/whitelist → 模型级过滤
   └── 空模型 Provider → 移除
```

### 合并策略

使用 `mergeDeep`（remeda）深度合并配置。同一 Provider 的多次配置按优先级覆盖：

```typescript
function mergeProvider(providerID: ProviderID, provider: Partial<Info>) {
  const existing = providers[providerID]
  if (existing) {
    providers[providerID] = mergeDeep(existing, provider)
    return
  }
  const match = database[providerID]
  if (!match) return
  providers[providerID] = mergeDeep(match, provider)
}
```

## 内置 Provider (Bundled SDK)

以下 Provider 的 SDK 包在构建时已打包，无需额外安装：

| Provider ID | npm 包 | 创建函数 |
|-------------|--------|----------|
| `amazon-bedrock` | `@ai-sdk/amazon-bedrock` | `createAmazonBedrock` |
| `anthropic` | `@ai-sdk/anthropic` | `createAnthropic` |
| `azure` | `@ai-sdk/azure` | `createAzure` |
| `google` | `@ai-sdk/google` | `createGoogleGenerativeAI` |
| `google-vertex` | `@ai-sdk/google-vertex` | `createVertex` |
| `google-vertex-anthropic` | `@ai-sdk/google-vertex/anthropic` | `createVertexAnthropic` |
| `openai` | `@ai-sdk/openai` | `createOpenAI` |
| `openai-compatible` | `@ai-sdk/openai-compatible` | `createOpenAICompatible` |
| `openrouter` | `@openrouter/ai-sdk-provider` | `createOpenRouter` |
| `xai` | `@ai-sdk/xai` | `createXai` |
| `mistral` | `@ai-sdk/mistral` | `createMistral` |
| `groq` | `@ai-sdk/groq` | `createGroq` |
| `deepinfra` | `@ai-sdk/deepinfra` | `createDeepInfra` |
| `cerebras` | `@ai-sdk/cerebras` | `createCerebras` |
| `cohere` | `@ai-sdk/cohere` | `createCohere` |
| `gateway` | `@ai-sdk/gateway` | `createGateway` |
| `togetherai` | `@ai-sdk/togetherai` | `createTogetherAI` |
| `perplexity` | `@ai-sdk/perplexity` | `createPerplexity` |
| `vercel` | `@ai-sdk/vercel` | `createVercel` |
| `alibaba` | `@ai-sdk/alibaba` | `createAlibaba` |
| `gitlab` | `gitlab-ai-provider` | `createGitLab` |
| `github-copilot` | `@opencode-ai/core/github-copilot/copilot-provider` | `createOpenaiCompatible` |
| `venice` | `venice-ai-sdk-provider` | `createVenice` |

## 自定义 Provider (custom 函数)

`custom()` 函数为每个 Provider ID 定义特殊行为：

### 典型自定义行为

- **`anthropic`**：自动注入 `anthropic-beta` headers（`interleaved-thinking`、`fine-grained-tool-streaming`）
- **`opencode`**：根据认证状态决定是否加载模型；无认证时设置 `apiKey: "public"`
- **`openai` / `xai`**：使用 `sdk.responses()` 而非 `sdk.languageModel()`（Responses API）
- **`azure`**：自动解析 `AZURE_RESOURCE_NAME`；支持 `useCompletionUrls` 选项
- **`amazon-bedrock`**：复杂的区域前缀处理（`us.`、`eu.`、`apac.`、`jp.`、`au.`）、凭证链加载、bearer token 支持
- **`google-vertex`**：自动解析项目和位置；使用 `google-auth-library` 获取 ADC token；自定义 fetch 注入 Authorization header
- **`github-copilot`**：GPT-5+ 模型使用 Responses API，其余使用 Chat API
- **`gitlab`**：workflow 模型发现、agentic chat 支持、feature flags 注入
- **`cloudflare-ai-gateway`**：使用 `ai-gateway-provider` 包和 Unified API 格式（`provider/model`）

## SDK 解析与缓存

`resolveSDK()` 函数负责加载和缓存 Provider SDK 实例：

1. 根据模型配置构建 options（baseURL 变量替换、API key、headers 合并）
2. 使用 `Hash.fast` 基于 (providerID, npm, options) 生成缓存 key
3. 优先使用内置的 `BUNDLED_PROVIDERS` 加载
4. 非内置包通过 `Npm.add` 动态安装，或使用 `file://` 加载本地包
5. 自动注入自定义 fetch（支持 chunk 超时、请求超时、OpenAI itemId 剥离）

```typescript
async function resolveSDK(model: Model, s: State, envs: Record<string, string | undefined>) {
  const key = Hash.fast(JSON.stringify({ providerID, npm, options }))
  const existing = s.sdk.get(key)
  if (existing) return existing
  // 加载或安装 SDK...
  s.sdk.set(key, loaded)
  return loaded
}
```

## 模型匹配与建议

### 模糊匹配 (closest)

按查询关键词在模型 ID 中搜索，返回第一个匹配：

```typescript
const closest = Effect.fn("Provider.closest")(function* (providerID, query) {
  for (const item of query) {
    for (const modelID of Object.keys(provider.models)) {
      if (modelID.includes(item)) return { providerID, modelID }
    }
  }
})
```

### 智能建议 (modelSuggestions)

使用 `fuzzysort` 进行模糊匹配，fallback 到子串匹配：

```typescript
function modelSuggestions(provider, modelID, enableExperimentalModels) {
  const available = suggestionModelIDs(provider, enableExperimentalModels)
  const fuzzy = fuzzysort.go(modelID, available, { limit: 3, threshold: -10000 })
  if (fuzzy.length) return fuzzy.map((m) => m.target)
  // fallback: 子串匹配 + 评分排序
}
```

## 轻量模型选择 (getSmallModel)

按优先级顺序查找轻量模型：

```typescript
let priority = [
  "claude-haiku-4-5", "claude-haiku-4.5",
  "3-5-haiku", "3.5-haiku",
  "gemini-3-flash", "gemini-2.5-flash",
  "gpt-5-nano",
]
```

对于 `amazon-bedrock`，额外处理跨区域前缀（`global.`、`us.`、`eu.`）。支持 `Config.small_model` 覆盖。

## 默认模型选择 (defaultModel)

优先级：
1. `Config.model` 配置值
2. 最近使用的模型（从 `model.json` 读取）
3. 第一个可用 Provider 的排序后第一个模型

模型排序使用 `sort()` 函数，优先 `gpt-5`、`claude-sonnet-4`、`big-pickle`、`gemini-3-pro`，然后按 `latest` 和 ID 降序排列。

## 错误类型

| 错误类 | 说明 |
|--------|------|
| `ModelNotFoundError` | 模型未找到，携带 suggestions 和 cause |
| `InitError` | Provider SDK 初始化失败 |

## 关键设计决策

1. **多层配置合并**：Provider 配置从 models.dev、环境变量、认证、配置文件、插件多来源深度合并，后加载的覆盖先加载的

2. **SDK 延迟加载与缓存**：SDK 实例按 (providerID, npm, options) hash 缓存，首次使用时才加载，避免不必要的初始化

3. **内置 Provider 打包**：22 个常用 Provider SDK 在构建时打包，无需运行时 npm install，保证离线可用

4. **自定义 fetch 注入**：所有 SDK 请求经过自定义 fetch 包装，支持 chunk 超时、总超时、OpenAI itemId 剥离等功能

5. **区域感知的模型 ID 前缀**：Amazon Bedrock 根据 AWS 区域自动添加 `us.`、`eu.`、`apac.`、`jp.`、`au.` 等跨区域推理前缀

6. **Responses API 自动切换**：OpenAI 和 xAI 的 GPT-5+ 模型自动使用 Responses API（`sdk.responses()`），GitHub Copilot 的 GPT-5+ 同样

7. **模糊匹配 + 智能建议**：模型未找到时提供 `fuzzysort` 模糊匹配建议，帮助用户修正拼写错误

8. **OAuth 认证集成**：GitLab、Cloudflare 等 Provider 支持 OAuth 流程，认证后自动注入 token

9. **模型发现**：GitLab 支持运行时模型发现（workflow 模型），动态扩展可用模型列表

10. **变量替换**：baseURL 支持 `${VAR_NAME}` 环境变量替换，支持 Provider 自定义 vars loader

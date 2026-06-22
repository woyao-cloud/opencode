# @opencode/v2/AISDK — AI SDK 封装服务
> 源文件: `opencode/packages/core/src/aisdk.ts`
> 婧愭枃浠? `opencode/packages/core/src/aisdk.ts`

## 概述

AISDK 服务是对 `@open-code-ai-v2/aisdk` 底层 `generateAIResponse` 的封装层。它负责从 `Instance` 容器中按 provider 名称查找对应的 `AISDKProvider` 实现，拼装调用参数，并向上层暴露统一的 `stream` 方法。它是 AI 模型调用的唯一入口点。

### 依赖的 Services

| Service | 用途 |
|---|---|
| `Config` | 读取项目配置（传递给底层 `generateAIResponse`） |
| `Instance` | 按 provider 名称查找注册的 `AISDKProvider` 实例 |
| `Log` | 日志记录（传递给底层 `generateAIResponse`） |

## 核心接口

```ts
// --- 接口定义 ---
export class AISDK extends Service<AISDK>() {
  readonly [AISDKProvide] = AISDKProvide
  stream(prompt: string, options: AISDK.Options): Effect<never, never, Uint8Array>
}
```

`AISDK` 通过 `layer` 函数注册到 `Service`，同时注册 `AISDK.Provider` Tag：

```ts
// 构建层
const aisdkLayer = AISDK.layer() // = provide + register(AISDK.Provider, Instance)

// 服务访问
const aisdk = yield* AISDK
const stream = aisdk.stream("Hello", { provider: "openai", model: "gpt-4" })

// 注册 Provider（由外部插件/适配器完成）
instance.set({ [AISDK.Provider.key]: myOpenAIProvider })
```

## 数据结构

```ts
AISDK.Options = Schema.Struct({
  provider: Schema.String,           // provider 名称，用于从 Instance 查找 AISDKProvider
  model: Schema.String,              // 模型名称
  system: Schema.optional(Schema.String),  // 系统提示词
  messages: Schema.optional(Schema.Array(Schema.Struct({
    role: Schema.Literal("user", "assistant"),
    content: Schema.String,
  }))),                              // 历史消息
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Struct({
    description: Schema.String,
    input: Schema.Schema,
  }))),                              // 工具定义
  stopWhen: Schema.optional(Schema.Function),   // 停止条件回调
  experimental_repairToolCalls: Schema.optional(Schema.Function), // 工具调用修复回调
})
```

`AISDK.Provider` 是一个 `Tag<string, AISDKProvider>`，key 为 provider 名称字符串，value 为 `AISDKProvider` 实例。

## 关键实现细节

- **Provider 查找模式**: `stream` 方法通过 `Instance.get(AISDK.Provider, options.provider)` 按名称查找 provider，若未找到则抛出错误
- **统一错误处理**: `stream` 公开方法对所有错误做 `catchAll`，将错误对象 JSON 序列化为 `Uint8Array` 返回，确保流不会因未捕获异常中断
- **私有生成器**: 核心逻辑在私有 `#gen` 方法中，使用 `effect.gen` 编写，依次获取 Config、Log、Instance，查找 provider，最后委托给 `generateAIResponse`
- **Tag 注册**: `AISDK.layer()` 不仅 `provide` 自身，还通过 `register(AISDK.Provider, Instance)` 建立 Provider Tag 与 Instance 容器的绑定

## 关键设计决策

1. AISDK 本身不实现任何 AI 调用逻辑，纯粹作为外观（Facade），将调用委托给 `@open-code-ai-v2/aisdk` 包
2. Provider 通过 Tag + Instance 模式实现插件化注册，不与具体提供商耦合
3. `stream` 返回 `Uint8Array` 的 Effect，错误也被序列化到同一个输出流中，由调用方自行解析判断
4. `AISDK.Provider` 使用 `Tag<string, AISDKProvider>` 支持多 provider 共存（通过不同的 key 区分）
5. `Options` 使用 Schema.Struct 定义，提供运行时类型校验

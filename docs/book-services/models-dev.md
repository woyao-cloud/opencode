# @opencode/ModelsDev — 开发模型加载服务

## 概述

ModelsDev 服务负责在开发模式下加载本地模型配置。它调用 `@open-code-ai-v2/models-dev` 包的 `loadModelsDev` 函数，将开发环境中定义的模型注册到全局 `Instance` 容器，使 AISDK 可以通过 provider 名称查找到这些模型。

### 依赖的 Services

| Service | 用途 |
|---|---|
| `Config` | 读取项目配置（传递给底层 `loadModelsDev`） |
| `Log` | 日志记录（传递给底层 `loadModelsDev`） |
| `Instance` | 通过 `register` 回调将模型实例注册到全局容器 |

## 核心接口

```ts
// --- 接口定义 ---
export class ModelsDev extends Service<ModelsDev>() {
  readonly [ModelsDevProvide] = ModelsDevProvide
  load(): Effect<never, never, void>
}
```

`ModelsDev` 通过 `layer` 函数注册到 `Service`：

```ts
// 构建层
const modelsDevLayer = ModelsDev.layer() // = ModelsDev.provide()

// 服务访问
const modelsDev = yield* ModelsDev
yield* modelsDev.load()
```

## 数据结构

本服务无自定义 Schema 或数据结构。模型定义由底层 `loadModelsDev` 解析，注册通过回调函数完成。

## 关键实现细节

- **回调注册模式**: `load()` 调用 `loadModelsDev` 时传入 `register(id, model)` 回调，底层每解析到一个模型即回调一次，ModelsDev 将模型通过 `instance.set(model)` 注册到全局容器
- **纯委托模式**: `ModelsDev` 本身不做模型解析，只负责组装依赖（Config、Log）和提供注册回调
- **layer 最简实现**: `static layer()` 仅调用 `this.provide()`

## 关键设计决策

1. 使用回调模式（而非返回值）进行模型注册，允许底层流式产出模型实例
2. `register` 回调签名为 `(id: string, model: any) => void`，id 由底层生成，model 对象由 `instance.set()` 按 `Object.entries` 展开注册
3. 与 AISDK 的 Provider 注册机制配合——ModelsDev 注册的模型实例通过 Instance 容器被 AISDK 查找使用
4. `load()` 返回 `void`，模型数据完全通过 Instance 容器共享，不暴露内部模型列表
5. 标识符使用 `@opencode/ModelsDev`（无 `v2` 前缀），与核心 v2 服务命名空间略有区分

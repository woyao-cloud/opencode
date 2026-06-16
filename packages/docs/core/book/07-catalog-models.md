# Catalog：模型目录管理

> **目标读者**：熟悉服务注册/发现、配置中心（Nacos/Eureka）、SPI 机制的 Java 开发者。
> **本章目标**：理解 Catalog 如何管理 20+ AI 提供商的模型清单，以及它和 AuthV2、PluginV2 的协作关系。

---

## 7.1 Catalog 在系统中的位置

```
AuthV2 ─── 管理"谁能用"（凭证）
   │
   ▼
Catalog ── 管理"什么可用"（模型清单）
   │
   ▼
AISDK ──── 管理"怎么连接"（SDK 实例）
```

三个模块形成完整的 LLM 调用链路：

1. **AuthV2**：`active("anthropic")` → 获取 API Key
2. **Catalog**：`model.available()` → 获取可用模型列表
3. **AISDK**：`language(model)` → 获取 LanguageModel 实例

---

## 7.2 核心数据结构

```typescript
// 内部存储结构
type ProviderRecord = {
  provider: ProviderV2.Info                    // 提供商元数据
  models: HashMap<ModelV2.ID, ModelV2.Info>    // 模型列表
}
```

**对比 Nacos 的服务注册**：

```java
// Nacos 服务注册
@Service
public class OrderService {
    @NacosInjected
    private NamingService namingService;

    public void register() {
        // 注册服务实例
        namingService.registerInstance(
            "order-service",     // 服务名
            "192.168.1.1",       // IP
            8080                 // 端口
        );
    }
}
```

```typescript
// Catalog 的模型注册
// 每个提供商就是一个"服务"，每个模型就是一个"实例"
type ProviderRecord = {
  provider: ProviderV2.Info,     // 类似 "order-service"
  models: HashMap<ID, Info>,      // 类似 { "192.168.1.1:8080": Instance }
}
```

---

## 7.3 available vs all：可用性管理

```typescript
// Catalog 提供两种查询方式
interface Catalog {
  model: {
    all(): Effect<ModelV2.Info[]>        // 所有已注册的模型
    available(): Effect<ModelV2.Info[]>  // 当前可用的模型
  }
}
```

**什么时候用哪个？**

| 场景 | 方法 | 原因 |
|------|------|------|
| 显示模型选择器给用户 | `available()` | 不可用的模型选了也调用不了 |
| 管理后台的模型列表 | `all()` | 需要看到所有配置，包括离线的 |
| 自动选择默认模型 | `available()` | 不能选一个离线的模型 |
| 排查为什么某模型不可用 | `all()` → 过滤 | 对比 available 和 all 的差异 |

**可用性判断逻辑**：

```typescript
// 判断模型是否可用：调用其提供商检查可用性
available: Effect.fn("Catalog.available")(function* () {
  const allModels = yield* this.all()
  return allModels.filter((model) => {
    const provider = records.get(model.providerID)
    return provider?.provider.status === "available"
  })
})
```

---

## 7.4 default vs small：模型选择策略

```typescript
interface Catalog {
  model: {
    default(): Effect<Option<ModelV2.Info>>        // 用户设置的默认模型
    small(providerID): Effect<Option<ModelV2.Info>> // 轻量模型
    setDefault(providerID, modelID): Effect<void>   // 设置默认模型
  }
}
```

**使用场景对比**：

| 场景 | 应该用 | 它会找到 |
|------|--------|---------|
| 用户没指定模型时 | `default()` | 用户在配置中设置的默认模型 |
| 生成会话摘要 | `small("anthropic")` | Claude Haiku（轻量快速） |
| 生成代码补丁 | `small("openai")` | GPT-4o-mini |
| 复杂推理任务 | `default()` + 用户覆盖 | 用户选择的模型 |

**小模型的判定**：

```typescript
// 模型定义中标记 small 字段
ModelV2.Info {
  id: "gpt-4o-mini",
  small: true,       // ← 这个字段标记为小模型
  // ...
}

// small() 方法实现
small: Effect.fn("Catalog.small")(function* (providerID) {
  const records = yield* this.getAllRecords()
  const provider = records.get(providerID)
  if (!provider) return Option.none()

  // 找到该提供商下第一个标记为 small 的模型
  return pipe(
    HashMap.findFirst(provider.models, ([_, model]) => model.small),
    Option.map(([_, model]) => model),
  )
})
```

---

## 7.5 插件动态注册模型

Catalog 的真正强大之处在于：**模型不是硬编码的，而是通过插件动态注册的**。

### 7.5.1 工作流程

```
应用启动
    │
    ├── 加载内置模型（Anthropic、OpenAI 等）
    │
    ├── PluginV2.trigger("catalog.models")
    │       │
    │       ├── GitHub Copilot 插件 → 注册 copilot 模型
    │       ├── Cloudflare 插件 → 注册 cf 模型
    │       └── 企业版插件 → 注册企业模型
    │
    └── 合并所有模型到 records
```

### 7.5.2 插件注册示例

```typescript
// GitHub Copilot 插件的注册逻辑
const GitHubCopilotPlugin = {
  name: "github-copilot",
  triggers: {
    "catalog.models": () => [
      {
        providerID: "github-copilot",
        id: "copilot-gpt-4",
        capabilities: {
          temperature: true,
          streaming: true,
        },
        // ... 更多模型配置
      },
    ],
  },
}
```

### 7.5.3 为什么用插件而不是配置文件？

| 方式 | 优点 | 缺点 |
|------|------|------|
| 配置文件 `models.json` | 简单直观 | 需要更新整个应用来新增模型 |
| 插件动态注册 | 不用改核心代码 | 需要理解插件 API |
| SPI / ServiceLoader (Java) | 标准机制 | 需要 classpath 扫描 |

Catalog 选择了插件方式，因为模型信息往往是动态的——GitHub Copilot 的模型列表会随 Copilot 版本更新而变化，写在配置里就失去了灵活性。

---

## 7.6 端到端场景：模型选择器

```typescript
// 模型选择器的完整工作流
function ModelSelector() {
  return Effect.gen(function* () {
    // 1. 获取可用模型（排除离线提供商）
    const available = yield* Catalog.Service.model.available()

    // 2. 找到默认模型
    const defaultModel = yield* Catalog.Service.model.default()

    // 3. 找到当前提供商的小模型（用于摘要）
    const smallModel = yield* Catalog.Service.model.small(
      defaultModel.pipe(
        Option.map((m) => m.providerID),
        Option.getOrElse(() => ProviderV2.ID.make("anthropic")),
      )
    )

    // 4. 返回模型选择器需要的数据
    return {
      models: available,
      defaultId: Option.map(defaultModel, (m) => m.id),
      smallId: Option.flatMap(smallModel, (m) => Option.some(m.id)),
    }
  })
}
```

---

## 7.7 本章小结

| Java 概念 | Catalog 对应 | 优势 |
|-----------|-------------|------|
| Nacos 服务注册 | `HashMap<ProviderID, ProviderRecord>` | 无外部依赖 |
| SPI / ServiceLoader | PluginV2.trigger("catalog.models") | 运行时动态注册 |
| 服务上下线 | `available()` vs `all()` | 编译期区分 |
| 默认配置 | `default()` + `small()` | 明确的策略分层 |

**下一章预告**：基础设施模块——路径管理、文件系统抽象、特性标志。这些是支撑其他所有模块的"地基"。
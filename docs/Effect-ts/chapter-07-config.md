# 第 7 章：Config — 配置管理

## 一、本章概述

Config 是 Effect-TS 中声明式、类型安全的配置管理模块。它提供了一套完整的 DSL，用于声明配置项的结构、来源、默认值和验证规则，同时与 Context/Layer 系统无缝集成。

本章将介绍 Config 的四个核心主题：

1. **Config 基础 API** — `Config.string/number/boolean` 等便捷构造函数，`withDefault`、`option`、`nested`、`map` 等算子
2. **ConfigProvider** — `fromUnknown`、`fromEnv`、`fromDotEnvContents`、`constantCase`、`orElse` 等多种数据源
3. **Config 组合与验证** — `Config.all`、`Config.schema`、`Config.orElse`、`Config.redacted`、Schema 验证失败处理
4. **RuntimeFlags 模式** — 将 Config + Context.Service + Layer 结合的生产级配置模式

### 前置知识

- 第 2 章 Effect 基础：理解 `Effect`、`Effect.gen`、`Effect.runSync`
- 第 4 章 Context 与 Layer：理解 `Context.Service`、`Layer`、`Layer.effect`

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch07-config/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch07-config
bun install
bun run demo:basic     # Config 基础 API
bun run demo:provider  # ConfigProvider 数据源
bun run demo:compose   # 组合与验证
bun run demo:flags     # RuntimeFlags 模式
```

---

## 二、核心概念

### 2.1 什么是 Config

`Config<T>` 是一份"配置配方"：它描述如何从 `ConfigProvider` 中提取并验证一个类型为 `T` 的值。Config 不会自己读取任何数据——它只是一个声明，实际的数据读取由 `ConfigProvider` 完成。

```ts
import { Config } from "effect"

// Config<string> — 声明"我需要一个名为 HOST 的字符串配置"
const hostConfig = Config.string("HOST")

// Config<number> — 声明"我需要一个名为 PORT 的数字配置"
const portConfig = Config.number("PORT")

// Config<boolean> — 声明"我需要一个名为 DEBUG 的布尔配置"
const debugConfig = Config.boolean("DEBUG")
```

**Config 的核心特征：**

- **声明式**：Config 只声明"需要什么"，不关心"从哪里来"
- **可组合**：Config 可以通过 `all`、`nested`、`map` 等算子自由组合
- **可 yield**：Config 实现了 `Effect.Yieldable`，可以在 `Effect.gen` 中直接 `yield*`
- **类型安全**：每个 Config 都有精确的类型参数 `T`

### 2.2 Config 的类型模型

```
┌─────────────────────────────────────────┐
│  Config<T>                               │
│  ├─ 配置配方：描述如何读取和验证         │
│  ├─ 可 yield：在 Effect.gen 中直接使用   │
│  ├─ 可组合：all / nested / map / orElse  │
│  └─ .parse(provider) → Effect<T, ConfigError> │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  ConfigProvider                          │
│  ├─ 数据源：从哪里读取原始配置数据       │
│  ├─ fromUnknown / fromEnv / fromDotEnv   │
│  ├─ constantCase / orElse / nested       │
│  └─ layer / layerAdd                     │
└─────────────────────────────────────────┘
```

### 2.3 Config 便捷构造函数

Effect-TS 提供了丰富的便捷构造函数，覆盖常见的配置类型：

| 构造函数 | 返回类型 | 说明 |
|---------|---------|------|
| `Config.string("KEY")` | `Config<string>` | 字符串配置 |
| `Config.number("KEY")` | `Config<number>` | 数字配置（含 NaN/Infinity） |
| `Config.boolean("KEY")` | `Config<boolean>` | 布尔配置（支持 yes/no/on/off/1/0） |
| `Config.int("KEY")` | `Config<number>` | 整数配置（拒绝浮点数） |
| `Config.port("KEY")` | `Config<number>` | 端口号（1-65535） |
| `Config.duration("KEY")` | `Config<Duration>` | Duration 配置（如 "10 seconds"） |
| `Config.url("KEY")` | `Config<URL>` | URL 配置 |
| `Config.literals([...], "KEY")` | `Config<Literal>` | 枚举值限制 |
| `Config.redacted("KEY")` | `Config<Redacted>` | 敏感信息（自动遮蔽） |

### 2.4 ConfigProvider 数据源

`ConfigProvider` 是 Config 的数据来源。Effect-TS 提供了多种预构建的 Provider：

| Provider | 数据来源 | 适用场景 |
|---------|---------|---------|
| `fromUnknown(obj)` | JSON 对象 | 测试、开发、硬编码配置 |
| `fromEnv({env})` | 环境变量 | 生产环境、12-factor app |
| `fromDotEnvContents(str)` | .env 字符串 | 从远程加载的 .env 内容 |
| `fromDotEnv()` | .env 文件 | 本地开发（需 FileSystem） |
| `fromDir({rootPath})` | 目录树 | Kubernetes ConfigMap 挂载 |

Provider 支持变换和组合：

```ts
// constantCase: 将 camelCase 键转换为 CONSTANT_CASE
const provider = ConfigProvider.fromEnv({ env: { DATABASE_HOST: "localhost" } })
  .pipe(ConfigProvider.constantCase)

// orElse: 主源 + 回退源
const combined = ConfigProvider.orElse(primary, fallback)

// nested: 添加路径前缀
const scoped = provider.pipe(ConfigProvider.nested("app"))
```

---

## 三、实战指南

### 3.1 基础配置读取

最简单的配置使用方式：用便捷构造函数声明配置，在 `Effect.gen` 中 `yield*` 获取值。

```ts
import { Config, ConfigProvider, Effect } from "effect"

const program = Effect.gen(function* () {
  const host = yield* Config.string("HOST")
  const port = yield* Config.number("PORT")
  return `服务器启动于 ${host}:${port}`
})

const result = Effect.runSync(
  program.pipe(
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ HOST: "localhost", PORT: 3000 })
    )
  )
)
// => "服务器启动于 localhost:3000"
```

### 3.2 默认值与可选配置

```ts
// withDefault: 缺失时使用默认值
const port = Config.number("PORT").pipe(Config.withDefault(3000))

// option: 缺失时返回 None，存在时返回 Some(value)
const maybeDebug = Config.option(Config.boolean("DEBUG"))
```

**重要区别**：`withDefault` 和 `option` 仅在**数据缺失**时生效。如果数据存在但类型错误（如 `PORT="abc"`），验证错误仍然会传播。

### 3.3 使用 Schema 定义结构化配置

`Config.schema` 是最高级的配置定义方式。它利用 `Schema.Codec` 来解码和验证配置数据。

```ts
import { Config, ConfigProvider, Effect, Schema } from "effect"

const AppConfig = Config.schema(
  Schema.Struct({
    host: Schema.String,
    port: Schema.Int,
    debug: Schema.Boolean
  }),
  "app"  // 配置根路径
)

const provider = ConfigProvider.fromUnknown({
  app: { host: "api.example.com", port: 8080, debug: true }
})

const config = Effect.runSync(AppConfig.parse(provider))
// => { host: "api.example.com", port: 8080, debug: true }
```

### 3.4 多配置组合

```ts
const DatabaseConfig = Config.all({
  host: Config.string("host"),
  port: Config.port("port").pipe(Config.withDefault(5432)),
  name: Config.string("name"),
  poolSize: Config.int("poolSize").pipe(Config.withDefault(10))
}).pipe(Config.nested("database"))
// Config.nested 将配置限定在 "database" 命名空间下
```

### 3.5 多源回退

```ts
// ConfigProvider 级别回退（路径未找到时触发）
const combined = ConfigProvider.orElse(primaryProvider, fallbackProvider)

// Config 级别回退（捕获所有 ConfigError）
const host = Config.string("PRIMARY_HOST").pipe(
  Config.orElse(() => Config.string("FALLBACK_HOST"))
)
```

**区别**：
- `ConfigProvider.orElse`：当路径不存在（返回 `undefined`）时回退
- `Config.orElse`：捕获所有 `ConfigError`（包括验证错误）
- `Config.withDefault`：仅在数据缺失时回退，验证错误仍传播

### 3.6 敏感信息保护

```ts
const ApiConfig = Config.all({
  endpoint: Config.string("ENDPOINT"),
  apiKey: Config.redacted("API_KEY")
})
// apiKey 在日志和 toString 中自动遮蔽为 <redacted>
```

### 3.7 RuntimeFlags 模式（生产级）

RuntimeFlags 模式是 OpenCode 中使用的生产级配置模式，将 Config、Context.Service 和 Layer 三者结合：

```
第 1 步: 定义 Service 类
  class RuntimeFlags extends Context.Service<RuntimeFlags, Shape>()("RuntimeFlags") {}

第 2 步: 用 Config 声明配置映射
  const config = Config.all({ debug: Config.boolean("DEBUG"), ... })

第 3 步: Layer.effect 将 Config 值注入 Context
  const layer = Layer.effect(RuntimeFlags)(Effect.gen(function* () {
    return yield* config
  }))

第 4 步: 业务代码只需 yield* RuntimeFlags
  const program = Effect.gen(function* () {
    const flags = yield* RuntimeFlags
    // 使用 flags，不关心配置来源
  })
```

**模式优势：**
- **类型安全**：每个标志的类型由 Service 类保证
- **可测试**：用 `Layer.succeed` 直接注入测试值
- **可组合**：`Layer.mergeAll` 组合多个配置服务
- **环境无关**：同一业务代码，不同 `ConfigProvider` 产生不同行为

完整示例见 `docs/Effect-ts/demos/ch07-config/src/04-runtime-flags-pattern.ts`。

---

## 四、进阶技巧

### 4.1 Config.map 与 Config.mapOrFail

对配置值进行变换：

```ts
// 纯函数变换
const upper = Config.string("HOST").pipe(Config.map(s => s.toUpperCase()))

// 可能失败的变换
const validated = Config.string("NAME").pipe(
  Config.mapOrFail(s => s.length > 0
    ? Effect.succeed(s)
    : Effect.fail(new ConfigError(...))
  )
)
```

### 4.2 ConfigProvider.mapInput

自定义路径变换，如将配置键从下划线转为 camelCase：

```ts
const provider = ConfigProvider.fromEnv({ env: { MY_APP_HOST: "localhost" } })
  .pipe(ConfigProvider.mapInput(path =>
    path.map(seg => typeof seg === "string" ? seg.toLowerCase() : seg)
  ))
```

### 4.3 ConfigProvider.layerAdd 追加式配置

`layerAdd` 不替换现有的 ConfigProvider，而是与其合并：

```ts
// 基础配置层
const baseLayer = ConfigProvider.layer(fromUnknown({ HOST: "base.local" }))

// 追加默认值（仅在基础层未提供时生效）
const defaultsLayer = ConfigProvider.layerAdd(
  fromUnknown({ HOST: "default.local", PORT: 3000 })
)

// 合并后: HOST 来自基础层, PORT 来自默认值层
```

### 4.4 Config.make 自定义 Config

当便捷构造函数无法满足需求时，使用 `Config.make`：

```ts
const customConfig = Config.make((provider) =>
  Effect.all({
    host: Config.string("host").parse(provider),
    port: Config.number("port").parse(provider)
  })
)
```

### 4.5 ConfigProvider.fromDir

适用于 Kubernetes ConfigMap 卷挂载场景：

```ts
// 目录结构: /etc/config/database/host, /etc/config/database/port
const provider = yield* ConfigProvider.fromDir({ rootPath: "/etc/config" })
```

---

## 五、常见误区

### 误区 1：混淆 Config.nested 和 ConfigProvider.nested

- `Config.nested("prefix")` — 在 **Config 定义级别**添加前缀
- `ConfigProvider.nested("prefix")` — 在 **Provider 级别**添加前缀

两者可以组合使用，但前缀顺序不同。`ConfigProvider.nested` 的 prefix 在 `mapInput` 之后应用。

```ts
// Config 级别嵌套
const dbConfig = Config.all({ host: Config.string("host") })
  .pipe(Config.nested("database"))
// 查找路径: ["database", "host"]

// Provider 级别嵌套
const scoped = provider.pipe(ConfigProvider.nested("database"))
// 所有 Config 的查找都自动加上 ["database"] 前缀
```

### 误区 2：认为 withDefault 捕获所有错误

`withDefault` **仅在数据缺失时**生效。如果数据存在但类型错误，验证错误仍然会传播。

```ts
const port = Config.port("PORT").pipe(Config.withDefault(3000))

// PORT="8080" → 8080 ✓ (值存在且合法)
// PORT 缺失   → 3000 ✓ (默认值生效)
// PORT="abc"  → ConfigError ✗ (值存在但非法，默认值不生效!)
```

如果需要捕获所有错误，请使用 `Config.orElse`。

### 误区 3：在 Effect.gen 外使用 Config

Config 是一个声明，不是值。在 `Effect.gen` 外部调用 `Config.string("KEY")` 只是创建了一个配置配方，并不会读取任何数据。

```ts
// ❌ 错误：这只是一个声明，不会读取值
const host = Config.string("HOST")
console.log(host) // Config 对象，不是字符串

// ✅ 正确：在 Effect.gen 中 yield* 来获取实际值
const program = Effect.gen(function* () {
  const host = yield* Config.string("HOST")  // 这里是实际的字符串
  console.log(host)
})
```

### 误区 4：忽略 ConfigProvider 的默认值

`ConfigProvider` 是 `Context.Reference`，默认值为 `fromEnv()`。如果你不显式提供 `ConfigProvider`，它会自动使用 `process.env`。在测试中，这可能导致意外的环境依赖。

```ts
// ✅ 测试中显式提供 ConfigProvider
const testProgram = program.pipe(
  Effect.provideService(
    ConfigProvider.ConfigProvider,
    ConfigProvider.fromUnknown({ HOST: "test.local" })
  )
)
```

---

## 六、总结

| 概念 | 职责 | 关键 API |
|------|------|----------|
| **Config\<T\>** | 配置配方：声明读取和验证规则 | `string()`, `number()`, `boolean()`, `schema()`, `all()` |
| **ConfigProvider** | 数据源：从何处读取原始配置 | `fromUnknown()`, `fromEnv()`, `fromDotEnvContents()` |
| **ConfigError** | 配置错误：包装 SourceError 或 SchemaError | `ConfigError.cause._tag` |
| **RuntimeFlags 模式** | 生产级模式：Config + Service + Layer | `Context.Service` + `Config.all` + `Layer.effect` |

**核心原则：**

1. **声明式优先**：用 Config 声明"需要什么"，而不是手动读取环境变量
2. **Provider 可替换**：同一个 Config 配方，换一个 Provider 就换一个数据源
3. **Schema 做验证**：用 `Config.schema` + `Schema.Struct` 获得完整的类型验证
4. **Layer 做注入**：用 `Layer.effect` 将 Config 值注入 Context，业务代码只需 `yield*`

---

## 七、参考资料

- [Effect-TS 官方文档 — Config](https://effect.website/docs/guides/configuration)
- [Effect-TS API 参考 — Config](https://effect.website/docs/reference/config)
- [Effect-TS API 参考 — ConfigProvider](https://effect.website/docs/reference/configprovider)
- [12-Factor App — Config](https://12factor.net/config)
- 示例代码：`docs/Effect-ts/demos/ch07-config/src/`
- 第 4 章 Context 与 Layer：理解 Config 与 Context 的集成基础

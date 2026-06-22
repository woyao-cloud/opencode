# @opencode/Agent — Agent 配置服务
> 源文件: `opencode/packages/opencode/src/agent/agent.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/agent/agent.ts`

## 概述

`@opencode/Agent` 是 OpenCode 的**Agent 定义与管理服务**，负责定义内置 Agent（build、plan、general、explore 等）、合并用户自定义 Agent 配置、生成默认权限规则集，以及通过 AI 自动生成新的 Agent 配置。

每个 Agent 定义了名称、模式（primary/subagent/all）、权限规则集、模型偏好、系统提示词等属性，运行时由执行引擎根据 Agent 配置决定工具访问权限和行为策略。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取用户自定义 Agent 配置（cfg.agent）、默认 Agent 设置 |
| `Auth` | `@opencode/Auth` | 获取认证信息（generate 时需要判断 provider 类型） |
| `Plugin` | `@opencode/Plugin` | 触发 chat.system.transform 钩子（generate 时） |
| `Skill` | `@opencode/Skill` | 获取技能目录（用于构建 readonlyExternalDirectory 白名单） |
| `Provider` | `@opencode/Provider` | 获取模型和语言（generate 时需要） |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 读取实验性功能标志（experimentalScout） |

```typescript
export const defaultLayer = layer.pipe(
  Layer.provide(Plugin.defaultLayer),
  Layer.provide(Provider.defaultLayer),
  Layer.provide(Auth.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Skill.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderID; modelID: ModelID }
  }) => Effect.Effect<{
    identifier: string
    whenToUse: string
    systemPrompt: string
  }, Provider.ModelNotFoundError>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Agent") {}
```

### 使用示例

```typescript
// 获取指定 Agent
const agent = yield* Agent.Service.get("build")

// 列出所有 Agent
const agents = yield* Agent.Service.list()

// 获取默认 Agent 的名称
const defaultName = yield* Agent.Service.defaultAgent()

// AI 生成 Agent 配置
const generated = yield* Agent.Service.generate({
  description: "A code review specialist that focuses on security issues",
})
```

## 数据结构

### Agent Info

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | Agent 名称（唯一标识） |
| `description` | `string?` | Agent 描述 |
| `mode` | `"subagent"` / `"primary"` / `"all"` | 运行模式 |
| `native` | `boolean?` | 是否为内置 Agent |
| `hidden` | `boolean?` | 是否在列表中隐藏 |
| `topP` | `number?` | Top-P 采样参数 |
| `temperature` | `number?` | 温度参数 |
| `color` | `string?` | UI 显示颜色 |
| `permission` | `Permission.Ruleset` | 权限规则集 |
| `model` | `{ modelID, providerID }?` | 指定模型 |
| `variant` | `string?` | 模型变体 |
| `prompt` | `string?` | 自定义系统提示词 |
| `options` | `Record<string, unknown>` | 额外选项（深度合并） |
| `steps` | `number?` | 最大执行步数 |

### 生成结果

```typescript
const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})
```

## 内置 Agent

| Agent | 模式 | 说明 |
|-------|------|------|
| `build` | primary | 默认 Agent，根据配置的权限执行工具。额外允许 question 和 plan_enter |
| `plan` | primary | 计划模式，禁止所有编辑工具。允许写入 `.opencode/plans/` 目录 |
| `general` | subagent | 通用子 Agent，禁止 todowrite，用于并行执行多单元工作 |
| `explore` | subagent | 代码探索专用，只允许只读工具（grep、glob、read、bash、webfetch、websearch） |
| `scout` | subagent | 文档和依赖源码专家（实验性），允许 repo_clone、repo_overview |
| `compaction` | primary | 上下文压缩（hidden），禁止所有工具 |
| `title` | primary | 标题生成（hidden），temperature=0.5，禁止所有工具 |
| `summary` | primary | 摘要生成（hidden），禁止所有工具 |

## 关键实现细节

### 权限规则构建

默认权限规则集定义：

```typescript
const defaults = Permission.fromConfig({
  "*": "allow",
  doom_loop: "ask",
  external_directory: { "*": "ask", ...whitelistedDirs },
  question: "deny",
  plan_enter: "deny",
  plan_exit: "deny",
  repo_clone: "deny",
  repo_overview: "deny",
  read: { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" },
})
```

每个 Agent 的最终权限 = `defaults` + Agent 特定权限 + 用户配置权限（`cfg.permission`）的三层合并。

### Truncate.GLOB 保护

系统自动确保每个 Agent 的 `external_directory` 权限中包含 `Truncate.GLOB` 的 allow 规则，除非用户显式配置了 deny：

```typescript
for (const name in agents) {
  const explicit = agent.permission.some((r) => {
    if (r.permission !== "external_directory") return false
    if (r.action !== "deny") return false
    return r.pattern === Truncate.GLOB
  })
  if (explicit) continue
  agents[name].permission = Permission.merge(
    agents[name].permission,
    Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
  )
}
```

### 用户配置合并

用户通过 `opencode.json` 的 `agent` 字段配置自定义 Agent：

```typescript
for (const [key, value] of Object.entries(cfg.agent ?? {})) {
  if (value.disable) { delete agents[key]; continue }  // 禁用内置 Agent
  let item = agents[key]
  if (!item) item = agents[key] = { /* 新建 Agent */ }
  // 合并各项配置（用户配置优先，未配置的保留默认值）
  item.model = value.model ?? item.model
  item.prompt = value.prompt ?? item.prompt
  item.mode = value.mode ?? item.mode
  // options 使用深度合并
  item.options = mergeDeep(item.options, value.options ?? {})
  // permission 使用 Permission.merge
  item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
}
```

### Agent 列表排序

```typescript
const list = Effect.fnUntraced(function* () {
  return pipe(
    agents,
    values(),
    sortBy(
      [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
      [(x) => x.name, "asc"],
    ),
  )
})
```

默认 Agent 排在第一位，其余按名称字母序排列。

### AI 生成 Agent

`generate()` 方法使用 AI 模型根据描述自动生成 Agent 配置：

```
Agent.generate({ description })
  ├── 1. 获取默认模型和语言
  ├── 2. 触发 plugin.trigger("experimental.chat.system.transform")
  ├── 3. 获取已有 Agent 列表（避免重名）
  ├── 4. 调用 generateObject（结构化输出）
  │     └── OpenAI OAuth 模式使用 streamObject（支持 providerOptions）
  │     └── 其他模式使用 generateObject
  └── 5. 返回 { identifier, whenToUse, systemPrompt }
```

## 关键设计决策

1. **三层权限合并**：defaults → Agent 特定 → 用户配置，层层叠加，后者覆盖前者，数组字段使用 Set 去重拼接

2. **Agent 禁用而非删除**：用户可以通过 `disable: true` 禁用内置 Agent，而非直接删除，保持配置的可逆性

3. **hidden Agent 模式**：compaction、title、summary 等内部 Agent 标记为 hidden，不在用户界面展示但可被系统调用

4. **mode 三元分类**：`primary`（主 Agent，可直接对话）、`subagent`（子 Agent，由主 Agent 调用）、`all`（两者皆可）

5. **Truncate.GLOB 强制保护**：系统确保工具输出截断目录始终可访问，即使在其他权限被收紧的情况下

6. **options 深度合并**：Agent 的 options 字段使用 `mergeDeep` 而非浅覆盖，支持用户增量配置

7. **AI 生成的 Agent 自动避免重名**：generate 时传入已有 Agent 名称列表，要求 AI 生成不重复的标识符

8. **OpenAI OAuth 特殊处理**：OpenAI OAuth 模式下使用 `streamObject` + `providerOptions`（含 instructions 和 store: false），与其他 provider 的 `generateObject` 路径分开

# @opencode/SystemPrompt — 系统提示词生成服务
> 源文件: `opencode/packages/opencode/src/session/system.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/session/system.ts`

## 概述

`@opencode/SystemPrompt` 是 OpenCode 的**系统提示词生成服务**，负责根据当前 AI 模型、运行环境和 Agent 配置，动态生成 LLM 系统提示词。它基于 Effect 框架实现，对外暴露为 Effect Service，在构建 AI 请求的 prompt 阶段被调用。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Skill` | `@opencode/Skill` | 技能服务，获取当前 Agent 可用的技能列表并格式化 |

```typescript
// system.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* Skill.Service

    return Service.of({
      environment: Effect.fn("SystemPrompt.environment")(function* (model: Provider.Model) {
        // ...
      }),
      skills: Effect.fn("SystemPrompt.skills")(function* (agent: Agent.Info) {
        // ...
      }),
    })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Skill.defaultLayer))
```

## 核心接口

```typescript
export interface Interface {
  readonly environment: (model: Provider.Model) => Effect.Effect<string[]>
  readonly skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/SystemPrompt") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取环境信息提示词
yield* SystemPrompt.Service.environment(model)

// 获取技能列表提示词
yield* SystemPrompt.Service.skills(agent)
```

## 导出的独立函数

除 Effect Service 接口外，模块还导出一个独立的 `provider` 函数（不在 Interface 中，直接在模块顶层导出）：

```typescript
export function provider(model: Provider.Model): string[]
```

该函数根据模型 ID 匹配对应的提供商专用系统提示词模板。

### 模型 → 提示词映射表

| 模型匹配条件 | 提示词模板 | 说明 |
|-------------|-----------|------|
| `gpt-4` / `o1` / `o3` | `PROMPT_BEAST` | OpenAI 高级模型（`beast.txt`） |
| `gpt` + `codex` | `PROMPT_CODEX` | OpenAI Codex 专用（`codex.txt`） |
| `gpt`（其他） | `PROMPT_GPT` | OpenAI 通用（`gpt.txt`） |
| `gemini-` | `PROMPT_GEMINI` | Google Gemini 系列（`gemini.txt`） |
| `claude` | `PROMPT_ANTHROPIC` | Anthropic Claude 系列（`anthropic.txt`） |
| `trinity` | `PROMPT_TRINITY` | Trinity 模型（`trinity.txt`） |
| `kimi` | `PROMPT_KIMI` | Moonshot Kimi（`kimi.txt`） |
| 其他（默认） | `PROMPT_DEFAULT` | 通用默认（`default.txt`） |

匹配逻辑：按上表顺序依次检测 `model.api.id` 是否包含对应子串，**首次命中即返回**。`trinity` 和 `kimi` 使用大小写不敏感匹配，其余区分大小写。

## 方法详解

### environment()

```typescript
environment: (model: Provider.Model) => Effect.Effect<string[]>
```

生成描述当前运行环境的系统提示词，返回一个**单元素字符串数组**。

生成的提示词包含：

| 信息 | 来源 | 示例 |
|------|------|------|
| 模型名称 | `model.api.id` | `You are powered by the model named claude-sonnet-4-20250514` |
| 模型完整 ID | `model.providerID/model.api.id` | `The exact model ID is anthropic/claude-sonnet-4-20250514` |
| 工作目录 | `ctx.directory` | `Working directory: /home/user/project` |
| 工作区根目录 | `ctx.worktree` | `Workspace root folder: /home/user/project` |
| 是否为 Git 仓库 | `ctx.project.vcs` | `Is directory a git repo: yes` |
| 操作系统 | `process.platform` | `Platform: linux` |
| 当前日期 | `new Date()` | `Today's date: Fri Jun 20 2026` |

环境信息包装在 `<env>` XML 标签中，方便 LLM 解析。

### skills()

```typescript
skills: (agent: Agent.Info) => Effect.Effect<string | undefined>
```

生成当前 Agent 可用技能的系统提示词，返回一个**字符串**（技能列表的格式化文本），或 `undefined`（技能工具被禁用时）。

处理流程：

```
skills(agent)
  ├── 1. 检查权限：Permission.disabled(["skill"], agent.permission)
  │     └── 如果 "skill" 工具被禁用 → 返回 undefined
  ├── 2. 调用 skill.available(agent) 获取可用技能列表
  └── 3. 使用 Skill.fmt(list, { verbose: true }) 格式化
        └── 附加引导文本（Skills provide specialized instructions...）
```

返回的提示词结构：

```
Skills provide specialized instructions and workflows for specific tasks.
Use the skill tool to load a skill when a task matches its description.
[详细技能列表 — 由 Skill.fmt 生成，verbose 模式]
```

### 设计考量：verbose 模式

注释中提到，使用 `verbose: true` 在系统提示词中展示更详细的技能信息，而在 tool description 中展示较简略的版本——实测表明 LLM 对技能信息的消化效果更好。

## 提示词模板文件

所有提示词模板以 `.txt` 文件形式存储在 `packages/opencode/src/session/prompt/` 目录下，通过 Vite 的 `?raw` import 在构建时内联到代码中：

```
prompt/
├── anthropic.txt    # Claude 系列系统提示词
├── beast.txt        # GPT-4/o1/o3 系统提示词
├── codex.txt        # Codex 专用系统提示词
├── default.txt      # 默认通用系统提示词
├── gemini.txt       # Gemini 系列系统提示词
├── gpt.txt          # GPT 通用系统提示词
├── kimi.txt         # Kimi 系统提示词
└── trinity.txt      # Trinity 系统提示词
```

每个文件包含该模型系列专属的系统提示词内容，在请求构建时作为第一段 system message 注入。

## 在请求构建中的角色

`SystemPrompt` 服务在两个关键位置被调用，共同构成 AI 请求的 system message：

### 1. `session/llm.ts` — LLM 调用入口（`provider` 函数）

在 `llm.ts` 中构建 system prompt 时，**独立函数 `SystemPrompt.provider()`** 被直接调用（不走 Effect Service），根据模型选择对应的提供商提示词模板：

```typescript
// llm.ts:107
system.push([
  ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
  ...input.system,
  ...input.agent.instructions ?? [],
])
```

优先级：**Agent 自定义 prompt > 模型提供商模板**。如果 Agent 配置了 `prompt` 字段，则使用 Agent 自己的 prompt，否则调用 `provider()` 根据模型匹配对应的 `.txt` 模板。

### 2. `session/prompt.ts` — Prompt 构建主流程（Service 接口）

在 `prompt.ts` 中，通过 Effect 依赖注入获取 Service 实例，并行调用 `skills()` 和 `environment()`：

```typescript
// prompt.ts:205
const sys = yield* SystemPrompt.Service

// prompt.ts:1813-1814
sys.skills(agent),
sys.environment(model),
```

这两个方法以 `Effect.all` 的形式并行执行，返回值与其他 prompt 组件（如 reference、attachment、todo 等）一起合并为完整的 system message。

### 完整拼接顺序

```
system prompt =
  [provider 模板 / Agent 自定义 prompt]      ← llm.ts (provider())
  + [environment 环境信息]                    ← prompt.ts (Service.environment)
  + [skills 技能列表]                         ← prompt.ts (Service.skills)
  + [其他系统指令...]                         ← prompt.ts (reference, attachment, todo, etc.)
```

### Layer 依赖注入

在 `prompt.ts` 中通过 `SystemPrompt.defaultLayer` 提供 Service 依赖：

```typescript
// prompt.ts:2043
SystemPrompt.defaultLayer,
```

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，通过 `InstanceState` 获取运行时上下文，天然支持并发和错误处理

2. **模型感知的提示词模板**：`provider()` 函数根据模型 ID 字符串匹配选择对应的系统提示词，使不同 AI 提供商可以使用各自优化过的系统指令

3. **首次命中匹配策略**：模型匹配按优先级顺序进行（从最具体的 `gpt-4/o1/o3` 到最通用的 `default`），首个匹配即返回，确保特殊模型不会被通用模板误匹配

4. **技能权限检查**：`skills()` 在生成技能提示词前先检查 agent 权限，如果 `skill` 工具被禁用则返回 `undefined`，避免在提示词中出现不可用的技能信息

5. **Verbose 技能格式化**：在系统提示词中使用 `verbose: true` 模式展示技能列表，而在 tool description 中使用简略版，这种不对称策略能提升 LLM 对技能信息的理解和使用效果

6. **环境信息 XML 标签化**：`environment()` 将运行环境信息包裹在 `<env>` 标签中，利用 XML 结构化标记帮助 LLM 更好地识别和解析上下文信息

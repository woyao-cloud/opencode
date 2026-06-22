# @opencode/ToolRegistry — 工具注册中心
> 源文件: `opencode/packages/opencode/src/tool/registry.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/tool/registry.ts`

## 概述

`@opencode/ToolRegistry` 是 OpenCode 的**工具注册中心**，负责管理所有内置工具和自定义工具（来自插件和 `.opencode/` 目录）的注册、发现和分发。它根据当前模型、Agent 配置和运行时标志，动态组装可用工具列表，并注入描述增强（如 Task 工具的 subagent 列表、Skill 工具的 skill 列表）。它是 Agent 与可调用工具之间的唯一桥梁。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 获取配置目录、等待依赖安装 |
| `Plugin` | `@opencode/Plugin` | 加载插件定义的工具 |
| `Agent` | `@opencode/Agent` | 获取 Task 工具可用的 subagent 列表 |
| `Skill` | `@opencode/Skill` | 获取 Skill 工具可用的 skill 列表 |
| `Session` | `@opencode/Session` | Session 上下文 |
| `Provider` | `@opencode/Provider` | Provider 信息（用于 webSearch 判断） |
| `Truncate` | `@opencode/Truncate` | 工具输出截断 |
| `Question` | `@opencode/Question` | Question 工具 |
| `Todo` | `@opencode/Todo` | Todo 工具 |
| `LSP` | `@opencode/LSP` | LSP 工具 |
| `Instruction` | `@opencode/Instruction` | 指令服务 |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统抽象 |
| `Bus` | `@opencode/Bus` | 事件总线 |
| `Git` | `@opencode/Git` | Git 操作 |
| `Reference` | `@opencode/Reference` | 命名引用 |
| `Permission` | `@opencode/Permission` | 权限评估 |
| `Ripgrep` | `@opencode/Ripgrep` | ripgrep 搜索 |
| `Format` | `@opencode/Format` | 代码格式化 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 运行时功能标志 |

```typescript
// registry.ts layer 定义
export const layer: Layer.Layer<Service, never,
  | Config.Service | Plugin.Service | Question.Service | Todo.Service
  | Agent.Service | Skill.Service | Session.Service | SessionStatus.Service
  | BackgroundJob.Service | Provider.Service | Git.Service | Reference.Service
  | LSP.Service | Instruction.Service | AppFileSystem.Service | Bus.Service
  | HttpClient.HttpClient | ChildProcessSpawner | Ripgrep.Service
  | Format.Service | Truncate.Service | RuntimeFlags.Service
> = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  const plugin = yield* Plugin.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly ids: () => Effect.Effect<string[]>                              // 所有工具的 ID 列表
  readonly all: () => Effect.Effect<Tool.Def[]>                            // 所有工具定义
  readonly named: () => Effect.Effect<{ task: TaskDef; read: ReadDef }>    // 命名的特殊工具（task、read）
  readonly tools: (model: {                                                // 按模型过滤后的工具列表
    providerID: ProviderID
    modelID: ModelID
    agent: Agent.Info
  }) => Effect.Effect<Tool.Def[]>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/ToolRegistry") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取所有工具
yield* ToolRegistry.Service.all()

// 获取模型相关的工具列表（含描述增强）
yield* ToolRegistry.Service.tools({ providerID, modelID, agent })
```

## 内置工具列表

ToolRegistry 管理以下内置工具，部分工具受运行时标志控制：

| 工具 ID | 工具类 | 条件 |
|---------|--------|------|
| `invalid` | `InvalidTool` | 始终启用 |
| `question` | `QuestionTool` | 客户端为 `app`/`cli`/`desktop` 或 `enableQuestionTool` 标志 |
| `shell` | `ShellTool` | 始终启用 |
| `read` | `ReadTool` | 始终启用 |
| `glob` | `GlobTool` | 始终启用 |
| `grep` | `GrepTool` | 始终启用 |
| `edit` | `EditTool` | 始终启用（GPT 模型可能被 patch 工具替代） |
| `write` | `WriteTool` | 始终启用（GPT 模型可能被 patch 工具替代） |
| `task` | `TaskTool` | 始终启用 |
| `task_status` | `TaskStatusTool` | `experimentalBackgroundSubagents` 标志 |
| `fetch` | `WebFetchTool` | 始终启用 |
| `todo` | `TodoWriteTool` | 始终启用 |
| `search` | `WebSearchTool` | opencode provider 或 exa/parallel 标志 |
| `repo_clone` | `RepoCloneTool` | `experimentalScout` 标志 |
| `repo_overview` | `RepoOverviewTool` | `experimentalScout` 标志 |
| `skill` | `SkillTool` | 始终启用 |
| `patch` | `ApplyPatchTool` | GPT 模型时启用（替换 edit/write） |
| `lsp` | `LspTool` | `experimentalLspTool` 标志 |
| `plan` | `PlanExitTool` | `experimentalPlanMode` 标志且客户端为 `cli` |

## 自定义工具加载

ToolRegistry 从两个来源加载自定义工具：

### 1. `.opencode/` 目录文件

扫描所有配置目录下的 `tool/` 或 `tools/` 子目录中的 `.js`/`.ts` 文件，通过动态 `import` 加载：

```typescript
const dirs = yield* config.directories()
const matches = dirs.flatMap((dir) =>
  Glob.scanSync("{tool,tools}/*.{js,ts}", { cwd: dir, absolute: true, dot: true, symlink: true }),
)
for (const match of matches) {
  const mod = yield* Effect.promise(() => import(pathToFileURL(match).href))
  // ...
}
```

命名规则：`default` 导出使用文件名作为工具 ID，其他命名导出使用 `{filename}_{exportName}`。

### 2. 插件工具

从 `Plugin.list()` 获取所有已加载插件的 `tool` 导出：

```typescript
const plugins = yield* plugin.list()
for (const p of plugins) {
  for (const [id, def] of Object.entries(p.tool ?? {})) {
    custom.push(fromPlugin(id, def))
  }
}
```

### 插件工具适配 (fromPlugin)

插件工具定义使用 Zod schema，ToolRegistry 将其转换为统一的 `Tool.Def` 格式，同时生成 JSON Schema 供 LLM 使用。工具执行时会自动应用 `Truncate.output` 截断。

## 描述增强

### Task 工具描述注入

`tools()` 方法会为 Task 工具动态注入可用的 subagent 列表和描述：

```typescript
const describeTask = Effect.fn("ToolRegistry.describeTask")(function* (agent: Agent.Info) {
  const items = (yield* agents.list()).filter((item) => item.mode !== "primary")
  const filtered = items.filter(
    (item) => Permission.evaluate("task", item.name, agent.permission).action !== "deny",
  )
  // 生成 "Available agent types and the tools they have access to:" 描述
})
```

### Skill 工具描述注入

`tools()` 方法会为 Skill 工具动态注入可用的 skill 列表：

```typescript
const describeSkill = Effect.fn("ToolRegistry.describeSkill")(function* (agent: Agent.Info) {
  const list = yield* skill.available(agent)
  return [
    "Load a specialized skill that provides domain-specific instructions and workflows.",
    // ...
    Skill.fmt(list, { verbose: false }),
  ].join("\n")
})
```

## 模型感知过滤

`tools()` 方法根据模型信息进行工具替换：

- **GPT 模型**：非 `gpt-4` 且非 `oss` 变体的 GPT 模型使用 `ApplyPatchTool` 替代 `EditTool` 和 `WriteTool`
- **WebSearch**：仅在 opencode provider 或启用 exa/parallel 时可用
- **实验性工具**：受 `RuntimeFlags` 控制

```typescript
const usePatch = input.modelID.includes("gpt-") && !input.modelID.includes("oss") && !input.modelID.includes("gpt-4")
if (tool.id === ApplyPatchTool.id) return usePatch
if (tool.id === EditTool.id || tool.id === WriteTool.id) return !usePatch
```

## 插件工具钩子

`tools()` 方法在返回每个工具定义前触发 `tool.definition` 插件钩子，允许插件修改工具描述、参数和 JSON Schema：

```typescript
yield* plugin.trigger("tool.definition", { toolID: tool.id }, output)
```

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，所有工具操作都通过 Effect 生成器，支持并发和资源管理

2. **InstanceState 缓存**：工具列表（内置 + 自定义）通过 `InstanceState.make` 缓存，与项目目录绑定，切换目录时自动重建

3. **插件工具 Zod 兼容**：插件工具使用 Zod schema，ToolRegistry 通过 `fromPlugin` 适配器将其转换为统一的 `Tool.Def` 格式，同时保留 JSON Schema 供 LLM 使用

4. **动态描述注入**：Task 和 Skill 工具的描述不是静态的，而是在 `tools()` 调用时根据当前 Agent 权限和可用资源动态生成

5. **模型感知工具替换**：根据模型 ID 自动选择最优工具组合（GPT 模型使用 patch 工具替代 edit/write），减少 LLM 出错概率

6. **并发工具初始化**：所有内置工具通过 `Effect.all` 并发初始化，自定义工具按顺序加载（先目录文件后插件）

7. **工具执行自动截断**：插件工具的输出自动经过 `Truncate.output` 处理，防止过长输出占用上下文窗口

8. **跨平台模块加载**：Windows 上使用 `pathToFileURL` 将文件路径转换为 `file://` URL 以确保动态 `import` 正常工作

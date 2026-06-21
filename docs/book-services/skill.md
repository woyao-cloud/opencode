# @opencode/Skill — 技能服务
> 婧愭枃浠? `opencode/packages/opencode/src/skill/index.ts`

## 概述

`@opencode/Skill` 是 OpenCode 的**技能（Skill）发现、加载与管理服务**。Skill 是一种扩展机制，通过 `SKILL.md` 文件（YAML frontmatter + Markdown 正文）定义可被 AI Agent 调用的领域知识与操作指南。技能服务负责从多个来源扫描、解析、去重并注册这些技能文件。

技能来源包括：
- 内置技能（`customize-opencode`，提供 opencode 配置文件的 schema 知识）
- 全局外部技能目录（`~/.claude/skills/**/SKILL.md`、`~/.agents/skills/**/SKILL.md`）
- 项目级外部技能目录（从项目目录向上查找到的 `.claude/`、`.agents/` 目录）
- 配置目录中的技能（`.opencode/` 下的 `skill/` 或 `skills/` 目录）
- 配置中 `skills.paths` 指定的额外目录
- 配置中 `skills.urls` 指定的远程技能仓库（通过 SkillDiscovery 拉取）

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Discovery` | `@opencode/SkillDiscovery` | 从远程 URL 拉取技能文件 |
| `Config` | `@opencode/Config` | 读取配置（skills.paths、skills.urls、config 目录列表） |
| `Bus` | `@opencode/Bus` | 发布技能加载错误事件 |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作（目录遍历、存在检查） |
| `Global` | `@opencode-ai/core/global` | 获取用户 home 目录 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 读取运行时标志（disableExternalSkills、disableClaudeCodeSkills） |

```typescript
export const defaultLayer = layer.pipe(
  Layer.provide(Discovery.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Bus.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Global.layer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly all: () => Effect.Effect<Info[]>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Skill") {}
```

### 使用示例

```typescript
// 按名称获取技能
const skill = yield* Skill.Service.get("my-skill")

// 获取所有已加载的技能
const all = yield* Skill.Service.all()

// 获取所有技能目录
const dirs = yield* Skill.Service.dirs()

// 获取对指定 Agent 可用的技能（按权限过滤）
const available = yield* Skill.Service.available(agentInfo)
```

## 数据结构

| 类型 | 字段 | 说明 |
|------|------|------|
| `Info` | `name: string` | 技能名称（来自 YAML frontmatter） |
| | `description?: string` | 技能描述 |
| | `location: string` | 技能文件的绝对路径 |
| | `content: string` | SKILL.md 的 Markdown 正文 |
| `State` | `skills: Record<string, Info>` | 已注册的技能字典，键为技能名称 |
| | `dirs: Set<string>` | 所有技能所在目录的集合 |
| `DiscoveryState` | `matches: string[]` | 扫描发现的 SKILL.md 文件路径列表 |
| | `dirs: string[]` | 技能目录列表 |

### 错误类型

| 错误 | 说明 |
|------|------|
| `InvalidError` | 技能文件解析失败（路径 + 错误信息 + issues） |
| `NameMismatchError` | 技能名称与预期不匹配 |

## 关键实现细节

### 技能发现流程

```
discoverSkills(config, discovery, fsys, global, flags, directory, worktree)
  ├── 1. 外部技能目录扫描（如果未禁用）
  │     ├── ~/.claude/skills/**/SKILL.md（如果未禁用 Claude Code 技能）
  │     ├── ~/.agents/skills/**/SKILL.md
  │     └── 从项目目录向上查找到的 .claude/ 和 .agents/ 目录
  ├── 2. 配置目录扫描
  │     └── 所有 config.directories() 下的 {skill,skills}/**/SKILL.md
  ├── 3. skills.paths 自定义目录扫描
  │     └── 每个路径下的 **/SKILL.md（支持 ~/ 展开和相对路径）
  └── 4. skills.urls 远程仓库拉取
        └── discovery.pull(url) → 扫描拉取目录下的 **/SKILL.md
```

### 技能加载与注册

```
loadSkills(state, discovered, bus)
  └── 并发加载所有发现的 SKILL.md 文件
        ├── ConfigMarkdown.parse() 解析 YAML frontmatter
        ├── 校验 frontmatter 必须包含 name 字段
        ├── 同名技能后者覆盖前者（警告日志）
        └── 解析失败时发布 Session.Event.Error 到总线
```

### 内置技能优先级

内置技能 `customize-opencode` 在磁盘技能发现**之前**注册，因此用户可以通过创建同名的磁盘技能来覆盖内置版本。

### 技能格式化

`fmt()` 函数将技能列表格式化为 AI 可读的 XML 或 Markdown 格式：

- **verbose 模式**：输出 `<available_skills>` XML 结构，包含 `<skill>`、`<name>`、`<description>`、`<location>` 标签
- **非 verbose 模式**：输出 Markdown 列表 `## Available Skills`

### 可用性过滤

`available()` 方法在获取所有技能后，使用 `Permission.evaluate("skill", skill.name, agent.permission)` 过滤掉被 Agent 权限规则拒绝的技能。

## 关键设计决策

1. **多来源分层扫描**：技能来源按优先级分为内置、全局外部、项目外部、配置目录、自定义路径、远程仓库，每层独立扫描，结果合并去重

2. **同名覆盖策略**：当多个来源存在同名技能时，后加载的覆盖先加载的（后者优先），并输出警告日志。这允许用户用本地技能覆盖远程或内置技能

3. **内置技能可覆盖**：`customize-opencode` 在磁盘扫描前注册，允许用户通过创建同名 SKILL.md 覆盖内置版本

4. **并发加载**：技能文件的解析和加载以 `concurrency: "unbounded"` 并发执行，最大化加载速度

5. **优雅降级**：单个技能文件解析失败不会阻止其他技能的加载，而是通过 Bus 事件通知前端展示错误

6. **外部技能可选**：通过 `RuntimeFlags` 的 `disableExternalSkills` 和 `disableClaudeCodeSkills` 标志，可以禁用外部技能目录的扫描，支持纯模式运行

# minicode SubAgent 系统升级记录

> 本文件记录了 minicode 从"硬编码固定管道"升级为接近完整版 opencode "通用调度引擎"的完整过程，分 4 个 Phase，共 10 个文件，+868 行。

## 概要

Phase 1 — Agent Schema 与权限系统（6 文件，+576 行）
- Agent.Info 从 6 字段扩展到 14 字段（增加 native/hidden/temperature/topP/color/variant/options/steps）
- Permission 模块增加 evaluate()、merge()、disabled()、嵌套 fromConfig()
- 新增 agent/subagent-permissions.ts（从完整版复制的 deriveSubagentSessionPermission）
- Session 增加 parentID 和 permission 字段，SQLite 新增 permission 列
Phase 2 — task tool 升级（1 文件，+93 行）
- 增加 background 参数支持后台执行
- 增加 Effect.acquireUseRelease 安全取消
- 创建子 session 时集成权限继承（deriveSubagentSessionPermission）
- 使用 subagent 的 model 配置而非硬编码
Phase 3 — 内置 SubAgent 定义（2 文件，+88 行）
- 3 个内置 agent：build（primary）、general（subagent）、explore（subagent）
- 每个有独立的 permission ruleset（explore 默认 deny 所有，只 allow grep/glob/read/bash）
- 新增 agent/prompt/explore.txt 专用 prompt
- 支持用户通过 minicode.json 覆盖内置 agent 配置
Phase 4 — BackgroundJob 服务（2 文件，+113 行）
- background/job.ts：完整的后台任务管理（start/list/get/cancel）
- 使用 Effect.forkIn(scope) 管理 fiber 生命周期
- 注册到 bootstrap 的 InstanceLayer
---

## 升级目标

```
升级前:
  CLI → Pipeline(Plan→Build→Review) → 3 个硬编码 agent

升级后:
  LLM → task tool → 任意 subagent (build/general/explore)
                    → 独立 Session + 权限继承
                    → 后台执行 + 安全取消
                    → BackgroundJob 管理
```

---

## Phase 1 — Agent Schema 与权限系统

**提交**: `d3139a463` — "Phase1: Agent Schema + Permission + Subagent Permissions + Session parentID/permission"

**变更文件**:

| 文件 | 变更 |
|---|---|
| `packages/opencode/src/agent/agent.ts` | Agent.Info 从 6 字段扩展到 14 字段 |
| `packages/opencode/src/permission/index.ts` | 增加 evaluate/merge/disabled/nested fromConfig |
| `packages/opencode/src/agent/subagent-permissions.ts` | **新建** — deriveSubagentSessionPermission |
| `packages/opencode/src/session/session.ts` | Session.create 增加 parentID/permission 参数 |
| `packages/opencode/src/session/session.sql.ts` | 新增 permission 列 |
| `docs/upgrade-plan.md` | **新建** — 升级规划文档 |

### 1.1 Agent.Info Schema 扩展

从 6 字段到 14 字段，对齐完整版：

```typescript
// 升级前
{ name, description, mode, permission, model, prompt }

// 升级后
{ name, description, mode, native, hidden, temperature, topP,
  color, permission, model, variant, prompt, options, steps }
```

### 1.2 Permission 模块完善

新增 4 个核心函数：

- **`evaluate(permission, pattern, ...rulesets)`** — 在多个 ruleset 中查找匹配规则（last match wins），默认返回 `{ action: "ask" }`
- **`fromConfig(map)`** — 支持嵌套对象配置（如 `{ external_directory: { "*": "ask", "/tmp/*": "allow" } }`）
- **`merge(...rulesets)`** — 合并多个 ruleset 为扁平列表
- **`disabled(tools, ruleset)`** — 计算哪些工具应被禁用（基于 deny-all 规则）

### 1.3 deriveSubagentSessionPermission

从完整版直接复制的 34 行函数，合并三部分权限：

1. 父 agent 的 edit-class deny 规则
2. 父 session 的 deny + external_directory 规则
3. 默认禁止 `todowrite` 和 `task`（除非 subagent 自身允许）

### 1.4 Session 扩展

- `Session.create` 新增 `parentID?: SessionID` 和 `permission?: Permission.Ruleset` 参数
- SQLite session 表新增 `permission TEXT` 列（JSON 序列化）
- `Session.get` 和 `Session.list` 返回时反序列化 permission

---

## Phase 2 — task tool 升级

**提交**: `1e09755c2` — "Phase2: task tool upgrade - background, cancel, permission inheritance, tool filter"

**变更文件**:

| 文件 | 变更 |
|---|---|
| `packages/opencode/src/tool/task.ts` | +93 行，全面升级 |

### 2.1 background 参数

```typescript
Parameters 新增:
  background: Schema.optional(Schema.Boolean)
    .annotate({ description: "When true, launch the subagent in the background" })

background 模式:
  Effect.runFork(runTask) → 立即返回 backgroundOutput
  输出含 task_id 和 "state: running" 标记
```

### 2.2 安全取消

使用 `Effect.acquireUseRelease` 模式：

```typescript
return yield* Effect.acquireUseRelease(
  Effect.sync(() => {}),  // acquire
  () => runTask,           // use
  (_, exit) => Effect.gen(function* () {
    if (Exit.hasInterrupts(exit)) yield* cancel
  }),                      // release
)
```

### 2.3 权限继承

创建子 session 时集成 `deriveSubagentSessionPermission`：

```typescript
childSession = yield* sessions.create({
  ...
  parentID: ctx.sessionID,
  permission: parent
    ? deriveSubagentSessionPermission({
        parentSessionPermission: parent.permission ?? [],
        parentAgent,
        subagent,
      })
    : undefined,
})
```

### 2.4 使用 subagent 的 model 配置

```typescript
const model = subagent.model
  ? { providerID: subagent.model.providerID, modelID: subagent.model.modelID }
  : { providerID: "openai", modelID: "gpt-4o-mini" }
```

---

## Phase 3 — 内置 SubAgent 定义

**提交**: `bc64cb8e7` — "Phase3: built-in subagents (build/general/explore) with permission rules"

**变更文件**:

| 文件 | 变更 |
|---|---|
| `packages/opencode/src/agent/agent.ts` | 从单 agent 改为 builtinAgents() 注册表 |
| `packages/opencode/src/agent/prompt/explore.txt` | **新建** — explore agent 专用 prompt |

### 3.1 内置 Agent 列表

| Agent | mode | 权限 | 用途 |
|---|---|---|---|
| `build` | primary | `*: allow` | 默认 agent，可执行所有工具 |
| `general` | subagent | `*: allow`, `todowrite: deny` | 通用子任务执行 |
| `explore` | subagent | `*: deny`, `grep/glob/read/bash: allow` | 代码搜索专用 |

### 3.2 用户配置覆盖

```typescript
// minicode.json 可覆盖内置 agent
{
  "agents": [
    {
      "name": "explore",
      "prompt": "Custom explore prompt...",
      "model": { "providerID": "openai", "modelID": "gpt-4o" }
    }
  ]
}
```

### 3.3 explore.txt prompt

```
You are a fast agent specialized for exploring codebases.
Your job is to find files, search code, and answer questions
about the codebase structure.

You have access to: grep, glob, read, bash

Rules:
- Be thorough: search multiple patterns and locations
- Report what you find concisely
- Do NOT modify any files.
```

---

## Phase 4 — BackgroundJob 服务

**提交**: `f1f0bf1e0` — "Phase4: BackgroundJob service with fork/scope lifecycle"

**变更文件**:

| 文件 | 变更 |
|---|---|
| `packages/opencode/src/background/job.ts` | **新建** — 111 行 BackgroundJob Service |
| `packages/opencode/src/project/bootstrap.ts` | 注册 BackgroundJob layer |

### 4.1 BackgroundJob Interface

```typescript
interface Interface {
  list(): Effect.Effect<Info[]>           // 列出所有 job
  get(id: string): Effect.Effect<Info | undefined>  // 查询单个 job
  start(input: StartInput): Effect.Effect<Info>      // 启动后台任务
  cancel(id: string): Effect.Effect<Info | undefined> // 取消任务
}

interface Info {
  id: string
  type: string
  title?: string
  status: "running" | "completed" | "error" | "cancelled"
  startedAt: number
  completedAt?: number
  output?: string
  error?: string
}
```

### 4.2 生命周期管理

- 使用 `Effect.forkIn(scope)` 将后台 fiber 绑定到 Scope
- `matchEffect` 处理成功/失败，自动更新 job 状态
- `Fiber.interrupt` 支持安全取消

---

## 最终差距对比

### ✅ 已对齐的功能

| 维度 | 升级前 | 升级后 | 完整版 |
|---|---|---|---|
| Agent Schema | 6 字段 | 14 字段 | 14+ 字段 |
| 通用调度器 | ❌ 无 | ✅ task tool（background/cancel/task_id） | task tool（337 行） |
| Session 隔离 | ❌ 无 | ✅ 独立 SQLite Session + parentID | 同 |
| 权限继承 | ❌ 无 | ✅ deriveSubagentSessionPermission | 同 |
| 后台执行 | ❌ 无 | ✅ background 参数 + BackgroundJob | 同 |
| 安全取消 | ❌ 无 | ✅ Effect.acquireUseRelease | 同 |
| 内置 subagent | 0 个 | 3 个（build/general/explore） | 7+ 个 |
| 工具过滤 | ❌ 无 | ✅ 通过 permission ruleset 控制 | 同 |

### ❌ 仍有差距

| 维度 | minicode | 完整版 |
|---|---|---|
| Agent 数量 | 3 个内置 | 7+ 内置 + 用户自定义 + LLM 生成 |
| Prompt 解析 | 直接调 LLM.generate | TaskPromptOps（resolvePromptParts/prompt/loop） |
| 事件推送 | 无 | Bus 推送 tool 状态、permission 请求、toast 到 TUI |
| 并行 agent | 无 | 多个 task 可并行运行 |
| 结果注入 | 无 | 后台任务完成自动注入父 session |
| 代码量 | task tool 205 行 | task tool 337 行 |

---

## 代码量统计

| 模块 | 升级前 | 升级后 | 完整版 |
|---|---|---|---|
| Agent 定义 | 29 行 | 97 行 | 463 行 |
| Permission | 21 行 | 68 行 | 306 行 |
| SubAgent 权限 | 0 行 | 36 行 | 34 行 |
| task tool | 115 行 | 205 行 | 337 行 |
| BackgroundJob | 0 行 | 111 行 | 200 行 |
| Agent 提示词 | 1 个 | 2 个 | 7 个 |
| **总计** | **~165 行** | **~517 行** | **~1340 行** |

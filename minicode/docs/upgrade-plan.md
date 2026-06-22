# minicode SubAgent 系统升级规划

> 目标：将 minicode 的 subagent 系统从"硬编码固定管道"升级为接近完整版 opencode 的"通用调度引擎"。

---

## 现状 vs 目标

```
当前 minicode:
  CLI → Pipeline(Plan→Build→Review) → 3 个硬编码 agent

目标:
  LLM → task tool → 任意 subagent (explore/general/自定义)
                    → 独立 Session + 权限继承
                    → 后台执行 + 结果注入
                    → 安全取消
```

---

## Phase 1 — Agent Schema 与权限系统（~150 行）

### 1.1 扩展 Agent.Info Schema

**文件**: `packages/opencode/src/agent/agent.ts`

当前 minicode 的 Agent.Info 只有 6 个字段，完整版有 14+ 个。需要补齐：

```typescript
// 当前
export const Info = Schema.Struct({
  name, description, mode, permission, model, prompt
})

// 目标：增加
  native: Schema.optional(Schema.Boolean),     // 是否内置 agent
  hidden: Schema.optional(Schema.Boolean),      // 是否对用户隐藏
  temperature: Schema.optional(Schema.Finite),  // LLM temperature
  topP: Schema.optional(Schema.Finite),         // LLM topP
  color: Schema.optional(Schema.String),        // TUI 颜色
  variant: Schema.optional(Schema.String),      // model variant
  options: Schema.Record(Schema.String, Schema.Unknown), // 扩展选项
  steps: Schema.optional(Schema.Finite),        // maxSteps
```

### 1.2 完善 Permission 模块

**文件**: `packages/opencode/src/permission/index.ts`

当前 minicode 的 `Permission.resolve` 永远返回 `"allow"`。需要实现：

- `Permission.merge(rulesets...)` — 合并多个 ruleset（后覆盖前）
- `Permission.fromConfig(map)` — 从配置对象生成 ruleset（已有，但需支持嵌套）
- `Permission.resolve(ruleset, permission, pattern)` — 在给定 ruleset 中查找匹配规则

完整版的 `fromConfig` 支持嵌套对象（如 `{ external_directory: { "*": "ask", "/tmp/*": "allow" } }`），minicode 当前只支持扁平字符串。

### 1.3 实现 deriveSubagentSessionPermission

**文件**: `packages/opencode/src/agent/subagent-permissions.ts`（新建）

直接从完整版复制，34 行：

```typescript
export function deriveSubagentSessionPermission(input: {
  parentSessionPermission: Permission.Ruleset
  parentAgent: Agent.Info | undefined
  subagent: Agent.Info
}): Permission.Ruleset {
  // 1. 父 agent 的 edit deny 规则
  // 2. 父 session 的 deny + external_directory 规则
  // 3. 默认禁止 todowrite 和 task（除非 subagent 自身允许）
}
```

### 1.4 扩展 Session.create 支持 permission 和 parentID

**文件**: `packages/opencode/src/session/session.ts`

当前 `Session.create` 只接受 `{ projectID, directory, title, agent }`。需要增加：

```typescript
interface CreateInput {
  projectID: string
  directory: string
  title?: string
  agent?: string
  parentID?: SessionID    // 新增：父 session
  permission?: Permission.Ruleset  // 新增：权限规则
}
```

permission 需要持久化到 SQLite（新增 `permission` 列到 session 表）。

---

## Phase 2 — task tool 升级（~200 行）

### 2.1 增加 background 参数

**文件**: `packages/opencode/src/tool/task.ts`

当前 minicode 的 task tool 没有 `background` 参数。需要：

1. Parameters 增加 `background: Schema.optional(Schema.Boolean)`
2. 当 `background: true` 时，fork 子 Effect 执行，立即返回 `backgroundOutput`
3. 后台任务完成后，通过 Bus 通知父 session

### 2.2 增加安全取消

使用 `Effect.acquireUseRelease` 模式：

```typescript
return yield* Effect.acquireUseRelease(
  Effect.sync(() => { ctx.abort.addEventListener("abort", onAbort) }),
  () => runTask(),
  (_, exit) => Effect.gen(function* () {
    if (Exit.hasInterrupts(exit)) yield* cancel
  }),
)
```

### 2.3 增加工具过滤

创建子 session 时，根据 subagent 的 permission 自动过滤工具：

```typescript
const tools = {
  ...(subagent.permission.some(r => r.permission === "todowrite") ? {} : { todowrite: false }),
  ...(subagent.permission.some(r => r.permission === "task") ? {} : { task: false }),
}
```

### 2.4 增加 parentID 和权限继承

创建子 session 时传入 `parentID` 和 `permission`：

```typescript
const childSession = yield* sessions.create({
  projectID: projectInfo.id,
  directory: projectInfo.directory,
  title: `${params.description} (@${subagent.name} subagent)`,
  agent: params.subagent_type,
  parentID: ctx.sessionID,
  permission: deriveSubagentSessionPermission({
    parentSessionPermission: parent.permission ?? [],
    parentAgent,
    subagent,
  }),
})
```

---

## Phase 3 — 内置 SubAgent 定义（~100 行）

### 3.1 增加内置 subagent

**文件**: `packages/opencode/src/agent/agent.ts`

在 `defaultInfo()` 之外，增加内置 subagent 定义：

| Agent | mode | 用途 | 权限 |
|---|---|---|---|
| `build` | primary | 默认 agent，可执行所有工具 | `*: allow` |
| `plan` | primary | 规划模式，禁止 edit | `edit: deny` |
| `general` | subagent | 通用子任务执行 | `todowrite: deny` |
| `explore` | subagent | 代码搜索专用 | `*: deny`, `grep/glob/read: allow` |

### 3.2 增加 subagent prompt 文件

| 文件 | 用途 |
|---|---|
| `packages/opencode/src/agent/prompt/explore.txt` | explore agent 的 system prompt |
| `packages/opencode/src/agent/prompt/general.txt` | general agent 的 system prompt |

---

## Phase 4 — 后台执行与事件推送（~150 行）

### 4.1 BackgroundJob Service

**文件**: `packages/opencode/src/background/job.ts`（新建）

管理后台任务的生命周期：

```typescript
interface BackgroundJob {
  id: string
  type: string
  title: string
  status: "running" | "completed" | "failed"
  run: Effect.Effect<void>
}

interface Interface {
  start(job: Omit<BackgroundJob, "status">): Effect.Effect<BackgroundJob>
  get(id: string): Effect.Effect<BackgroundJob | undefined>
  list(): Effect.Effect<BackgroundJob[]>
}
```

### 4.2 后台结果注入

后台任务完成后，通过 Bus 发送事件 → 父 session 收到后注入结果消息 → 触发 LLM 继续。

---

## 实施顺序

| 阶段 | 文件 | 行数 | 依赖 |
|---|---|---|---|
| **P1.1** | `agent/agent.ts` | +20 | 无 |
| **P1.2** | `permission/index.ts` | +30 | 无 |
| **P1.3** | `agent/subagent-permissions.ts` | +35 | P1.1, P1.2 |
| **P1.4** | `session/session.ts` + `session.sql.ts` | +30 | 无 |
| **P2.1-2.4** | `tool/task.ts` | +100 | P1.3, P1.4 |
| **P3.1-3.2** | `agent/agent.ts` + prompt 文件 | +80 | P1.1 |
| **P4.1-4.2** | `background/job.ts` + `bus/` | +150 | P2.1 |

总计约 **445 行新增/修改**，分 4 个 Phase，每个 Phase 可独立验证。

---

## 验证方式

每个 Phase 完成后：

1. `bun typecheck` 通过
2. `minicode plan -p "..." --build` 正常运行
3. 新功能测试：`task` tool 调用 subagent、权限继承、后台执行



### ---
> 目标：将 minicode 的 subagent 系统从"硬编码固定管道"升级为接近完整版 opencode 的"通用调度引擎"。
---
## 现状 vs 目标
```
当前 minicode:
  CLI → Pipeline(Plan→Build→Review) → 3 个硬编码 agent
目标:
  LLM → task tool → 任意 subagent (explore/general/自定义)
                    → 独立 Session + 权限继承
                    → 后台执行 + 结果注入
                    → 安全取消
```
---
## Phase 1 — Agent Schema 与权限系统（~150 行）
### 1.1 扩展 Agent.Info Schema
**文件**: `packages/opencode/src/agent/agent.ts`
当前 minicode 的 Agent.Info 只有 6 个字段，完整版有 14+ 个。需要补齐：
```typescript
// 当前
export const Info = Schema.Struct({
  name, description, mode, permission, model, prompt
})
// 目标：增加
  native: Schema.optional(Schema.Boolean),     // 是否内置 agent
  hidden: Schema.optional(Schema.Boolean),      // 是否对用户隐藏
  temperature: Schema.optional(Schema.Finite),  // LLM temperature
  topP: Schema.optional(Schema.Finite),         // LLM topP
  color: Schema.optional(Schema.String),        // TUI 颜色
  variant: Schema.optional(Schema.String),      // model variant
  options: Schema.Record(Schema.String, Schema.Unknown), // 扩展选项
  steps: Schema.optional(Schema.Finite),        // maxSteps
```
### 1.2 完善 Permission 模块
**文件**: `packages/opencode/src/permission/index.ts`
当前 minicode 的 `Permission.resolve` 永远返回 `"allow"`。需要实现：
- `Permission.merge(rulesets...)` — 合并多个 ruleset（后覆盖前）
- `Permission.fromConfig(map)` — 从配置对象生成 ruleset（已有，但需支持嵌套）
- `Permission.resolve(ruleset, permission, pattern)` — 在给定 ruleset 中查找匹配规则
完整版的 `fromConfig` 支持嵌套对象（如 `{ external_directory: { "*": "ask", "/tmp/*": "allow" } }`），minicode 当前只支持扁平字符串。
### 1.3 实现 deriveSubagentSessionPermission
**文件**: `packages/opencode/src/agent/subagent-permissions.ts`（新建）
直接从完整版复制，34 行：
```typescript
export function deriveSubagentSessionPermission(input: {
  parentSessionPermission: Permission.Ruleset
  parentAgent: Agent.Info | undefined
  subagent: Agent.Info
}): Permission.Ruleset {
  // 1. 父 agent 的 edit deny 规则
  // 2. 父 session 的 deny + external_directory 规则
  // 3. 默认禁止 todowrite 和 task（除非 subagent 自身允许）
}
```
### 1.4 扩展 Session.create 支持 permission 和 parentID
**文件**: `packages/opencode/src/session/session.ts`
当前 `Session.create` 只接受 `{ projectID, directory, title, agent }`。需要增加：
```typescript
interface CreateInput {
  projectID: string
  directory: string
  title?: string
  agent?: string
  parentID?: SessionID    // 新增：父 session
  permission?: Permission.Ruleset  // 新增：权限规则
}
```
permission 需要持久化到 SQLite（新增 `permission` 列到 session 表）。
---
## Phase 2 — task tool 升级（~200 行）
### 2.1 增加 background 参数
**文件**: `packages/opencode/src/tool/task.ts`
当前 minicode 的 task tool 没有 `background` 参数。需要：
1. Parameters 增加 `background: Schema.optional(Schema.Boolean)`
2. 当 `background: true` 时，fork 子 Effect 执行，立即返回 `backgroundOutput`
3. 后台任务完成后，通过 Bus 通知父 session
### 2.2 增加安全取消
使用 `Effect.acquireUseRelease` 模式：
```typescript
return yield* Effect.acquireUseRelease(
  Effect.sync(() => { ctx.abort.addEventListener("abort", onAbort) }),
  () => runTask(),
  (_, exit) => Effect.gen(function* () {
    if (Exit.hasInterrupts(exit)) yield* cancel
  }),
)
```
### 2.3 增加工具过滤
创建子 session 时，根据 subagent 的 permission 自动过滤工具：
```typescript
const tools = {
  ...(subagent.permission.some(r => r.permission === "todowrite") ? {} : { todowrite: false }),
  ...(subagent.permission.some(r => r.permission === "task") ? {} : { task: false }),
}
```
### 2.4 增加 parentID 和权限继承
创建子 session 时传入 `parentID` 和 `permission`：
```typescript
const childSession = yield* sessions.create({
  projectID: projectInfo.id,
  directory: projectInfo.directory,
  title: `${params.description} (@${subagent.name} subagent)`,
  agent: params.subagent_type,
  parentID: ctx.sessionID,
  permission: deriveSubagentSessionPermission({
    parentSessionPermission: parent.permission ?? [],
    parentAgent,
    subagent,
  }),
})
```
---
## Phase 3 — 内置 SubAgent 定义（~100 行）
### 3.1 增加内置 subagent
**文件**: `packages/opencode/src/agent/agent.ts`
在 `defaultInfo()` 之外，增加内置 subagent 定义：
| Agent | mode | 用途 | 权限 |
|---|---|---|---|
| `build` | primary | 默认 agent，可执行所有工具 | `*: allow` |
| `plan` | primary | 规划模式，禁止 edit | `edit: deny` |
| `general` | subagent | 通用子任务执行 | `todowrite: deny` |
| `explore` | subagent | 代码搜索专用 | `*: deny`, `grep/glob/read: allow` |
### 3.2 增加 subagent prompt 文件
| 文件 | 用途 |
|---|---|
| `packages/opencode/src/agent/prompt/explore.txt` | explore agent 的 system prompt |
| `packages/opencode/src/agent/prompt/general.txt` | general agent 的 system prompt |
---
## Phase 4 — 后台执行与事件推送（~150 行）
### 4.1 BackgroundJob Service
**文件**: `packages/opencode/src/background/job.ts`（新建）
管理后台任务的生命周期：
```typescript
interface BackgroundJob {
  id: string
  type: string
  title: string
  status: "running" | "completed" | "failed"
  run: Effect.Effect<void>
}
interface Interface {
  start(job: Omit<BackgroundJob, "status">): Effect.Effect<BackgroundJob>
  get(id: string): Effect.Effect<BackgroundJob | undefined>
  list(): Effect.Effect<BackgroundJob[]>
}
```
### 4.2 后台结果注入
后台任务完成后，通过 Bus 发送事件 → 父 session 收到后注入结果消息 → 触发 LLM 继续。
---
## 实施顺序
| 阶段 | 文件 | 行数 | 依赖 |
|---|---|---|---|
| **P1.1** | `agent/agent.ts` | +20 | 无 |
| **P1.2** | `permission/index.ts` | +30 | 无 |
| **P1.3** | `agent/subagent-permissions.ts` | +35 | P1.1, P1.2 |
| **P1.4** | `session/session.ts` + `session.sql.ts` | +30 | 无 |
| **P2.1-2.4** | `tool/task.ts` | +100 | P1.3, P1.4 |
| **P3.1-3.2** | `agent/agent.ts` + prompt 文件 | +80 | P1.1 |
| **P4.1-4.2** | `background/job.ts` + `bus/` | +150 | P2.1 |
总计约 **445 行新增/修改**，分 4 个 Phase，每个 Phase 可独立验证。
---
## 验证方式
每个 Phase 完成后：
1. `bun typecheck` 通过
2. `minicode plan -p "..." --build` 正常运行
3. 新功能测试：`task` tool 调用 subagent、权限继承、后台执行
Thinking: The user asked me to plan how to make minicode's multi-agent and subagent system closer to the full version. I've written a comprehensive upgrade plan to docs/upgrade-plan.md. Let me summarize it for the user.
规划已写入 docs/upgrade-plan.md。核心思路是分 4 个 Phase，总计约 445 行：
Phase 1 — Agent Schema 与权限系统（~150 行）
- 补齐 Agent.Info 的 14+ 字段（temperature、topP、native、hidden 等）
- 完善 Permission 模块（merge、resolve、嵌套 fromConfig）
- 实现 deriveSubagentSessionPermission（从完整版复制，34 行）
- Session 增加 parentID 和 permission 支持
Phase 2 — task tool 升级（~200 行）
- 增加 background 参数
- 增加安全取消（Effect.acquireUseRelease）
- 增加工具过滤（根据 subagent permission 自动禁用 todowrite/task）
- 集成权限继承到子 session 创建
Phase 3 — 内置 SubAgent 定义（~100 行）
- 增加 general、explore、plan 等内置 subagent
- 增加对应的 system prompt 文件
Phase 4 — 后台执行与事件推送（~150 行）
- 实现 BackgroundJob Service
- 后台任务完成时通过 Bus 注入结果到父 session
每个 Phase 可独立验证。要从 Phase 1 开始做吗？
# @opencode/Permission — 权限服务
> 源文件: `opencode/packages/opencode/src/permission/index.ts`
> 婧愭枃浠? `opencode/packages/opencode/src/permission/index.ts`

## 概述

`@opencode/Permission` 是 OpenCode 的**工具调用权限控制中心**，负责在 AI Agent 执行工具前拦截请求、评估规则、发起用户询问，并维护跨会话的批准记忆。它基于 Effect 框架实现，使用 Deferred 模式将异步用户交互转换为可等待的 Effect。

当 Agent 尝试执行某个工具（如写文件、执行命令）时，权限服务根据配置的规则集（Ruleset）评估是否允许、拒绝或需要询问用户。用户的回复（once/always/reject）会影响当前和后续同 session 内的权限请求。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Bus` | `@opencode/Bus` | 事件总线，发布 `permission.asked` / `permission.replied` 事件 |

```typescript
// permission/index.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    // ...
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Bus.layer))
```

## 核心接口

```typescript
export interface Interface {
  readonly ask: (input: AskInput) => Effect.Effect<void, Error>
  readonly reply: (input: ReplyInput) => Effect.Effect<void>
  readonly list: () => Effect.Effect<ReadonlyArray<Request>>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Permission") {}
```

### 使用示例

```typescript
// 发起权限请求（阻塞直到用户回复）
yield* Permission.Service.ask({
  permission: "edit",
  patterns: ["src/app.ts"],
  ruleset: agentPermission,
})

// 用户回复权限请求
yield* Permission.Service.reply({
  requestID: "perm_xxx",
  reply: "once",
})

// 列出所有待处理的权限请求
const pending = yield* Permission.Service.list()
```

## 数据结构

| 类型 | 说明 |
|------|------|
| `Action` | `"allow"` / `"deny"` / `"ask"` — 规则的动作 |
| `Rule` | `{ permission, pattern, action }` — 单条权限规则，pattern 支持通配符 |
| `Ruleset` | `Rule[]` — 规则集，按顺序匹配 |
| `Request` | 权限请求实体，包含 `id`, `sessionID`, `permission`, `patterns`, `metadata`, `always`, `tool` |
| `Reply` | `"once"` / `"always"` / `"reject"` — 用户回复类型 |
| `Approval` | `{ projectID, patterns }` — 持久化的批准记录，存储在 SQLite |
| `AskInput` | `{ ...Request, id?, ruleset }` — ask 方法的输入 |
| `ReplyInput` | `{ requestID, reply, message? }` — reply 方法的输入 |

### 错误类型

| 错误 | 触发条件 |
|------|----------|
| `DeniedError` | 规则集明确拒绝（action=deny），附带相关规则信息 |
| `RejectedError` | 用户在当前请求中点击拒绝 |
| `CorrectedError` | 用户拒绝并附带反馈消息 |

## 关键实现细节

### ask 流程

```
Permission.ask(input)
  ├── 1. 遍历 patterns，对每个 pattern 合并 ruleset + approved 规则集评估
  ├── 2. 如果任何 pattern 被 deny → 抛出 DeniedError
  ├── 3. 如果全部 allow → 直接返回（无需询问）
  ├── 4. 否则创建 Deferred，发布 bus 事件 permission.asked
  └── 5. 阻塞等待 Deferred.await，确保请求在 scope 关闭时被清理
```

### reply 流程

```
Permission.reply(input)
  ├── 1. 查找 pending 中的请求
  ├── 2. 发布 permission.replied 事件
  ├── 3. 如果 reject:
  │     ├── 对当前请求 fail Deferred（RejectedError 或 CorrectedError）
  │     └── 级联拒绝同 session 的所有其他 pending 请求
  └── 4. 如果 once/always:
        ├── succeed 当前 Deferred
        └── 如果 always: 将 always 中的 patterns 追加到 approved 规则集
              └── 级联合并同 session 中其他可以被新规则 allow 的 pending 请求
```

### 状态管理

状态通过 `InstanceState` 管理，与项目目录绑定：

```typescript
interface State {
  pending: Map<PermissionID, PendingEntry>  // 待处理的请求（Deferred 模式）
  approved: Ruleset                          // 持久化的批准规则（从 SQLite 加载）
}
```

- `pending` 在 scope 关闭时自动清理（finalizer 会对所有剩余 pending 调用 `Deferred.fail`）
- `approved` 从 `PermissionTable`（SQLite）加载，按 `project_id` 查询

### 规则评估

```typescript
export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): Rule {
  return evalRule(permission, pattern, ...rulesets)
}
```

规则评估使用 `Wildcard.match` 进行权限名匹配，支持 `*` 通配符。编辑类工具（`edit`, `write`, `apply_patch`）统一映射为 `"edit"` 权限。

### 路径展开

`expand()` 函数将 `~/` 和 `$HOME/` 前缀展开为操作系统主目录的绝对路径。

## 关键设计决策

1. **Deferred 阻塞模式**：权限请求使用 Effect 的 `Deferred` 原语将异步用户交互建模为可组合的 Effect，调用方只需 `yield* ask()` 即可等待用户决策，无需回调

2. **级联批准/拒绝**：当用户对某个请求选择 `always` 时，系统自动扫描同 session 内的其他 pending 请求，如果新规则可以覆盖则自动批准；选择 `reject` 时则级联拒绝同 session 的所有 pending 请求

3. **双层规则合并**：规则评估同时考虑传入的 `ruleset`（通常是 Agent 的权限配置）和持久化的 `approved` 规则集（用户历史批准），后者优先

4. **编辑工具统一映射**：`edit`、`write`、`apply_patch` 三个工具在权限检查时统一映射为 `"edit"` 权限，避免用户需要为每种编辑方式单独配置规则

5. **持久化批准记忆**：`approved` 规则集存储在 SQLite 的 `PermissionTable` 中，按项目 ID 隔离，跨会话保留用户的批准决策

6. **Scope 安全清理**：通过 `Effect.addFinalizer` 确保 scope 关闭时所有 pending 请求都被清理，防止内存泄漏和悬挂的 Promise

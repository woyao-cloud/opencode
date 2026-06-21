# @opencode/Command — 命令服务

## 概述

`@opencode/Command` 是 OpenCode 的**自定义命令注册与发现服务**，负责聚合来自三个来源的命令模板，为 AI Agent 和用户提供可调用的命名操作。

命令来源：
1. **内置命令**：`init`（引导式 AGENTS.md 设置）和 `review`（代码审查）
2. **配置命令**：用户在 `opencode.json` 的 `command` 字段中定义的自定义命令
3. **MCP 提示命令**：从 MCP 服务器的 `prompts` 能力自动注册的命令
4. **技能命令**：从已加载的 Skill 自动注册的命令（每个 Skill 对应一个命令）

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 读取用户配置的自定义命令 |
| `MCP` | `@opencode/MCP` | 获取 MCP 服务器的 prompts 列表，解析 prompt 模板 |
| `Skill` | `@opencode/Skill` | 获取已加载的技能列表作为命令 |

```typescript
export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(MCP.defaultLayer),
  Layer.provide(Skill.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Command") {}
```

### 使用示例

```typescript
// 按名称获取命令
const cmd = yield* Command.Service.get("init")

// 列出所有可用命令
const commands = yield* Command.Service.list()

// 使用命令的模板
const template = await cmd.template  // Promise<string> | string
```

## 数据结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 命令名称（唯一标识） |
| `description` | `string?` | 命令描述 |
| `agent` | `string?` | 指定执行的 Agent 名称 |
| `model` | `string?` | 指定使用的模型 |
| `source` | `"command"` / `"mcp"` / `"skill"` | 命令来源 |
| `template` | `string \| Promise<string>` | 命令模板（MCP 来源的为懒加载 Promise） |
| `subtask` | `boolean?` | 是否作为子任务执行 |
| `hints` | `string[]` | 模板中的变量提示（如 `$1`, `$ARGUMENTS`） |

### 事件

```typescript
export const Event = {
  Executed: BusEvent.define(
    "command.executed",
    Schema.Struct({
      name: Schema.String,
      sessionID: SessionID,
      arguments: Schema.String,
      messageID: MessageID,
    }),
  ),
}
```

### 默认命令

| 命令名 | 描述 | 特性 |
|--------|------|------|
| `init` | guided AGENTS.md setup | source=command，模板注入 worktree 路径 |
| `review` | review changes [commit\|branch\|pr] | source=command，subtask=true，模板注入 worktree 路径 |

## 关键实现细节

### 命令注册流程

```
Command.state(ctx)
  ├── 1. 注册内置命令 init, review
  ├── 2. 注册配置命令（cfg.command）
  │     └── 每个命令的 template 为 getter（延迟求值，每次访问返回原始 template）
  ├── 3. 注册 MCP 提示命令（mcp.prompts()）
  │     └── template 为懒加载 Promise（通过 EffectBridge 桥接 MCP 的异步 getPrompt 调用）
  │     └── hints 从 prompt.arguments 自动生成 $1, $2, ...
  └── 4. 注册技能命令（skill.all()）
        └── 技能名称冲突时，已有的命令（内置/配置/MCP）优先
```

### 模板变量提示

`hints()` 函数从模板文本中提取变量占位符：

```typescript
export function hints(template: string) {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)  // 匹配 $1, $2, ...
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}
```

### MCP 提示的懒加载

MCP 来源的命令模板不是静态字符串，而是一个通过 `EffectBridge` 桥接的 Promise：

```typescript
get template() {
  return bridge.promise(
    mcp.getPrompt(prompt.client, prompt.name, {
      /* 参数映射：argument.name → $1, $2, ... */
    }).pipe(
      Effect.map((template) =>
        template?.messages
          .map((message) => (message.content.type === "text" ? message.content.text : ""))
          .join("\n") || ""
      ),
    )
  )
}
```

这确保了每次访问模板时都能获取最新的 MCP 提示内容。

### 命令来源优先级

当多个来源存在同名命令时，优先级为：内置/配置 > MCP > Skill。即 Skill 不会覆盖已有的命令。

### 状态管理

命令状态通过 `InstanceState` 管理，与项目目录绑定。初始化函数接收 `InstanceContext`，从中获取 worktree 路径用于注入内置命令模板。

## 关键设计决策

1. **三源合一的命令注册表**：将配置命令、MCP 提示、技能三种不同来源统一为 `Command.Info` 接口，对外提供一致的查询体验

2. **MCP 模板懒加载**：MCP 命令的模板使用 Promise + EffectBridge 实现懒加载，避免在初始化时阻塞等待所有 MCP 服务器的 prompt 解析

3. **技能命令低优先级**：技能自动注册为命令时采用最低优先级，确保用户显式配置的命令和 MCP 提供的命令优先

4. **内置命令注入上下文**：内置命令（init、review）在模板中通过 `${path}` 替换注入当前 worktree 路径

5. **subtask 标志**：review 命令标记为 `subtask: true`，指示执行引擎将其作为子任务而非主会话运行

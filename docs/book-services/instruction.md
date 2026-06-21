# @opencode/Instruction — 指令文件加载服务
> 婧愭枃浠? `opencode/packages/opencode/src/session/instruction.ts`

## 概述

`@opencode/Instruction` 是 OpenCode 的**指令文件发现与加载服务**，负责在全局和项目级别查找、读取并格式化指令文件（AGENTS.md、CLAUDE.md、CONTEXT.md），为 AI 模型提供项目上下文和行为约束。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Config` | `@opencode/Config` | 获取配置中的 `instructions` 字段（额外指令文件/模式） |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统抽象，检查文件存在性、读取文件内容 |
| `Global` | `@opencode/Global` | 全局状态，获取全局配置目录和 home 目录 |
| `HttpClient` | `@opencode-ai/core/http` | HTTP 客户端，获取远程 URL 指令内容 |
| `RuntimeFlags` | `@opencode/RuntimeFlags` | 运行时标志，检查 `disableClaudeCodePrompt` 等开关 |

```typescript
// instruction.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const config = yield* Config.Service
  const fs = yield* AppFileSystem.Service
  const global = yield* Global.Service
  const http = yield* HttpClient.Service
  const flags = yield* RuntimeFlags.Service
  // ...
}))

export const defaultLayer = layer.pipe(
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Global.defaultLayer),
  Layer.provide(HttpClient.defaultLayer),
  Layer.provide(RuntimeFlags.defaultLayer),
)
```

## 核心接口

```typescript
export interface Interface {
  readonly clear: (messageID: string) => Effect.Effect<void>
  readonly systemPaths: () => Effect.Effect<string[]>
  readonly system: () => Effect.Effect<string[]>
  readonly find: (directory: string) => Effect.Effect<string[]>
  readonly resolve: (args: { messageID: string; readLines?: string[]; file?: string }) => Effect.Effect<string[]>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Instruction") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 获取系统指令文件路径列表
yield* Instruction.Service.systemPaths()

// 读取所有系统指令内容
yield* Instruction.Service.system()

// 解析文件读取操作相关的指令文件
yield* Instruction.Service.resolve({ messageID, file: "/path/to/file.ts" })
```

## 指令文件类型

指令文件是放置在项目或全局目录中的 Markdown 文件，用于向 AI 模型注入上下文信息。支持以下文件：

| 文件名 | 说明 | 状态 |
|--------|------|------|
| `AGENTS.md` | 通用指令文件，始终加载 | 活跃 |
| `CLAUDE.md` | Claude 专用指令文件，受 `disableClaudeCodePrompt` 标志控制 | 活跃 |
| `CONTEXT.md` | 上下文文件 | 已弃用 |

`CLAUDE.md` 的加载受运行时标志控制：当 `RuntimeFlags.disableClaudeCodePrompt` 为 `true` 时，跳过 `CLAUDE.md` 的发现和加载。

## 文件发现策略

### systemPaths() — 收集所有指令文件路径

`systemPaths()` 方法按以下顺序收集指令文件路径：

```
systemPaths()
  ├── 1. 全局指令文件（先匹配先得）
  │     ├── 全局配置目录下的 AGENTS.md
  │     └── ~/.claude/CLAUDE.md（home 目录）
  ├── 2. 项目级指令文件（先匹配先得）
  │     ├── 从项目根目录向上查找 (findUp) AGENTS.md
  │     └── 或向上查找 CLAUDE.md（如未禁用）
  └── 3. 配置中的额外指令 (config.instructions)
        ├── 绝对路径 → 直接使用
        ├── 相对路径 → 通过 globUp 向上匹配
        └── ~/ 路径 → 展开为用户 home 目录
```

**全局文件匹配规则**：先检查 `AGENTS.md`，存在则返回，不再检查 `CLAUDE.md`（"先匹配先得"）。

**项目级文件匹配规则**：使用 `findUp` 从项目根目录向上遍历，先找 `AGENTS.md`，存在则返回；否则查找 `CLAUDE.md`。

**额外指令解析**：`config.instructions` 数组中的条目支持三种形式：
- 绝对路径：直接作为文件路径
- 相对路径/glob 模式：通过 `globUp` 从项目目录向上匹配
- `~/` 前缀：展开为用户 home 目录

### find(dir) — 检查指定目录

`find(dir)` 方法检查给定目录下是否存在指令文件：

```
find(dir)
  ├── dir/AGENTS.md
  └── dir/CLAUDE.md（如未禁用）
```

返回存在的文件路径列表。该方法被 `resolve()` 用于检查被读取文件所在目录的指令文件。

### resolve() — 文件读取上下文关联

`resolve()` 方法在 AI 读取文件时被调用，用于发现与正在读取的文件相关联的指令文件。其核心逻辑：

```
resolve({ messageID, file })
  ├── 1. 检查该 messageID 是否已有 claim，有则跳过（避免重复附加）
  ├── 2. 检查 file 是否已在 systemPaths 中，在则跳过
  ├── 3. 检查 file 是否已被 extract() 从 tool calls 中提取，是则跳过
  └── 4. 调用 find(dirname(file)) 查找附近指令文件
```

**Claim 机制**：每个 `messageID` 对应一条消息。当 `resolve()` 首次为该消息找到指令文件后，会记录一个 claim，后续同一条消息中的其他文件读取不会再触发重复的指令文件附加。通过 `clear(messageID)` 可清除该消息的 claim 记录。

**去重策略**：
- `systemPaths` 中的文件已在系统提示词中加载，不需要在工具调用响应中重复附加
- `extract()` 方法扫描已完成消息中的 `"read"` 工具调用结果，提取其中已读取的指令文件路径，避免二次附加

## 文件读取与格式化

### system() — 读取所有指令文件内容

`system()` 方法读取 `systemPaths()` 返回的所有指令文件内容，返回格式化后的字符串数组：

```
system()
  ├── 本地文件读取（并发数：8）
  │     └── 读取文件内容 → 格式化为 "// ╔═ path/to/file ═╗\n<content>\n// ╚{'═'.repeat(header.length)}╝"
  └── 远程 URL 获取（并发数：4）
        └── HTTP GET → 5s 超时 → 同样格式化
```

**并发控制**：
- 本地文件读取使用 `Effect.forEach` 并发处理，并发上限 8
- 远程 URL 使用 `Effect.forEach` 并发处理，并发上限 4

**格式化输出**：每个文件内容被包装在带有路径标识的注释块中，便于在系统提示词中识别内容来源。

### 远程 URL 获取

当 `config.instructions` 中包含 HTTP/HTTPS URL 时，通过 `FetchHttpClient` 发起 GET 请求：

- 超时时间：5 秒
- 响应处理：读取完整响应体文本
- 格式化：与本地文件相同的注释块格式

## 关键设计决策

1. **Effect Service 模式**：使用 Effect 的 `Context.Service` 实现依赖注入，天然支持并发读取、错误处理和资源管理

2. **先匹配先得策略**：全局和项目级的 AGENTS.md / CLAUDE.md 发现采用"第一个匹配即返回"的策略，避免重复加载语义相同的文件

3. **Claim 去重机制**：通过 messageID 级别的 claim 追踪，确保同一轮对话中不会重复附加相同的指令文件，减少 token 浪费

4. **并发读取控制**：本地文件读取（并发 8）和远程 URL 获取（并发 4）分别设置并发上限，平衡性能与资源消耗

5. **灵活的文件路径解析**：`config.instructions` 支持绝对路径、glob 模式（`globUp`）和 `~` home 目录展开，适应多种配置场景

6. **与工具调用联动**：`extract()` 方法从已完成的 "read" 工具调用中提取路径，与 `resolve()` 协作避免在工具响应中重复附加指令内容

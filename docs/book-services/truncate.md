# @opencode/Truncate — 工具输出截断
> 婧愭枃浠? `opencode/packages/opencode/src/tool/truncate.ts`

## 概述

`@opencode/Truncate` 是 OpenCode 的**工具输出截断服务**，负责在工具输出超过预设的行数或字节数阈值时，将其截断并将完整内容写入文件。它提供清理过期截断文件的定时任务，并通过 Agent 权限感知来决定截断提示中是否建议使用 Task 工具。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统操作（读写截断文件、目录清理） |
| `Config` | `@opencode/Config` | 可选的，读取 `tool_output` 配置覆盖默认阈值 |

```typescript
// truncate.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const fs = yield* AppFileSystem.Service
  // Config.Service 通过 Effect.serviceOption 可选依赖
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly cleanup: () => Effect.Effect<void>
  /**
   * 将文本写入截断目录，返回文件路径
   */
  readonly write: (text: string) => Effect.Effect<string>
  /**
   * 当输出在限制内时原样返回；否则将完整文本写入截断目录并返回预览 + 提示
   */
  readonly output: (text: string, options?: Options, agent?: Agent.Info) => Effect.Effect<Result>
  /**
   * 解析截断限制：来自 opencode 配置的 tool_output，或 MAX_LINES / MAX_BYTES
   */
  readonly limits: () => Effect.Effect<{ maxLines: number; maxBytes: number }>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Truncate") {}
```

使用时通过 Effect 的 `Context` 机制注入：

```typescript
// 截断工具输出
const result = yield* Truncate.Service.output(toolOutput, {}, agentInfo)

// 手动写入
const file = yield* Truncate.Service.write(text)
```

## 数据结构

### Result

```typescript
export type Result =
  | { content: string; truncated: false }                                           // 未截断
  | { content: string; truncated: true; outputPath: string }                        // 已截断
```

### Options

```typescript
export interface Options {
  maxLines?: number      // 最大行数（覆盖配置）
  maxBytes?: number      // 最大字节数（覆盖配置）
  direction?: "head" | "tail"   // 截断方向，默认 "head"（保留头部）
}
```

### 常量

```typescript
export const MAX_LINES = 2000            // 默认最大行数
export const MAX_BYTES = 50 * 1024       // 默认最大字节数 (50KB)
export const DIR = TRUNCATION_DIR        // 截断文件目录
const RETENTION = Duration.days(7)       // 文件保留 7 天
```

## 截断文件管理

### 文件命名

截断文件使用 `ToolID.ascending()` 生成基于时间戳的升序 ID，确保按时间排序：

```typescript
const write = Effect.fn("Truncate.write")(function* (text: string) {
  const file = path.join(TRUNCATION_DIR, ToolID.ascending())
  yield* fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)
  yield* fs.writeFileString(file, text).pipe(Effect.orDie)
  return file
})
```

### 自动清理

服务初始化时启动一个定时清理任务：每隔 1 小时删除超过 7 天的截断文件：

```typescript
yield* cleanup().pipe(
  Effect.catchCause((cause) => {
    log.error("truncation cleanup failed", { cause: Cause.pretty(cause) })
    return Effect.void
  }),
  Effect.repeat(Schedule.spaced(Duration.hours(1))),   // 每小时重复
  Effect.delay(Duration.minutes(1)),                     // 延迟 1 分钟后开始
  Effect.forkScoped,                                     // 以 fork 方式运行
)
```

清理逻辑按文件名中的时间戳前缀过滤：

```typescript
const cutoff = Identifier.timestamp(
  Identifier.create("tool", "ascending", Date.now() - Duration.toMillis(RETENTION)),
)
const entries = yield* fs.readDirectory(TRUNCATION_DIR).pipe(
  Effect.map((all) => all.filter((name) => name.startsWith("tool_"))),
)
```

## 截断算法

### 方向："head"（保留头部）

从第一行开始逐行累加，直到超过行数或字节数限制：

```typescript
if (direction === "head") {
  for (i = 0; i < lines.length && i < maxLines; i++) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
    if (bytes + size > maxBytes) { hitBytes = true; break }
    out.push(lines[i])
    bytes += size
  }
}
```

### 方向："tail"（保留尾部）

从未行开始反向累加，使用 `unshift` 保持顺序：

```typescript
for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
  const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
  if (bytes + size > maxBytes) { hitBytes = true; break }
  out.unshift(lines[i])
  bytes += size
}
```

### 截断提示

根据 Agent 是否有 Task 工具权限，生成不同的提示：

- **有 Task 工具**：建议使用 Task 工具让 explore agent 处理文件
- **无 Task 工具**：建议直接使用 Grep 和 Read（带 offset/limit）查看

```typescript
const hint = hasTaskTool(agent)
  ? `...Use the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
  : `...Use Grep to search the full content or Read with offset/limit to view specific sections.`
```

## 配置化限制

`limits()` 方法从 `Config.Service` 读取 `tool_output` 配置覆盖默认阈值（通过 `Effect.serviceOption` 可选依赖）：

```typescript
const limits = Effect.fn("Truncate.limits")(function* () {
  const configSvc = yield* Effect.serviceOption(Config.Service)
  if (Option.isNone(configSvc)) return { maxLines: MAX_LINES, maxBytes: MAX_BYTES }
  const cfg = yield* configSvc.value.get()
  return {
    maxLines: cfg?.tool_output?.max_lines ?? MAX_LINES,
    maxBytes: cfg?.tool_output?.max_bytes ?? MAX_BYTES,
  }
})
```

## 关键设计决策

1. **双阈值检查**：同时检查行数和字节数，任一超限即触发截断，防止单行超长内容绕过行数限制

2. **双向截断**：支持 `head`（保留开头）和 `tail`（保留结尾）两种方向，适应不同工具的输出特征

3. **Agent 感知提示**：截断提示根据 Agent 是否有 Task 工具权限动态调整，引导正确的后续操作

4. **定时清理 + forkScoped**：清理任务以 `forkScoped` 方式运行在 scoped 生命周期内，每小时执行一次，自动清理 7 天前的文件

5. **Config 可选依赖**：Config 通过 `Effect.serviceOption` 作为可选依赖，确保在没有 Config 上下文的环境中也能正常工作（使用默认阈值）

6. **升序 ID 文件名**：使用 `ToolID.ascending()` 生成带时间戳的文件名，清理时按时间戳前缀过滤，避免解析文件元数据

7. **字节精确计数**：使用 `Buffer.byteLength(text, "utf-8")` 而非 `text.length` 计算字节数，正确处理多字节 UTF-8 字符

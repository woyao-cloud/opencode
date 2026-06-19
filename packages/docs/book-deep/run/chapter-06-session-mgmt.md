# 第 6 章 · 会话管理

## 6.1 场景概述

会话管理涵盖 Session 的 CRUD 操作、Compaction（上下文压缩）、Instruction（指令文件加载）、System Prompt 组装、Summary（摘要生成）等。这些操作的特点是：大多数是独立的 Effect 服务，通过 Layer 依赖注入被 `session/prompt.ts` 等上游模块调用。每个服务内部使用 Effect 管理自己的副作用（数据库读写、文件系统访问、HTTP 请求）。

为什么需要 Effect？会话管理的各个子模块需要不同的依赖组合——Compaction 需要 LLM 调用能力，Instruction 需要文件系统和 HTTP 客户端，Session CRUD 需要数据库访问。Effect 的 Layer 系统让每个子模块声明自己需要的依赖，由运行时自动注入，而不需要手动传递。

## 6.2 触发流程

```text
SessionPrompt.prompt() 被调用
    │
    ▼
┌─ Session CRUD (session/session.ts) ────────────────────────┐
│  Service 层: Effect.gen 包装所有数据库操作                   │
│  · get(id): 查询 Session                                    │
│  · create(input): 创建 Session                              │
│  · updateMessage/updatePart: 更新消息/Part                   │
│  · touch(id): 更新最后活跃时间                               │
│  · setTitle/setPermission: 更新元数据                       │
│                                                             │
│  Layer 组装: Layer.suspend 延迟加载                          │
│  → 数据库依赖在运行时才解析                                  │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ Compaction (session/compaction.ts) ───────────────────────┐
│  Service 层:                                                │
│  · isOverflow(): 检测 Token 是否超过模型限制                 │
│  · process(): 执行压缩（LLM 生成摘要 → 替换历史）            │
│  · create(): 创建压缩任务（插入 CompactionPart）             │
│  · prune(): 清理过期压缩数据                                 │
│                                                             │
│  运行时: makeRuntime(Service, defaultLayer)                  │
│  → 独立的轻量运行时，不依赖全局 AppRuntime                   │
│                                                             │
│  服务访问: serviceUse(Service)                               │
│  → 生成 use 函数，在非 Effect 上下文中调用服务方法           │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ Instruction (session/instruction.ts) ──────────────────────┐
│  Service 层:                                                │
│  · system(): 加载所有指令文件 + 远程 URL                     │
│    Effect.forEach(paths, read, { concurrency: 8 })          │
│    Effect.forEach(urls, fetch, { concurrency: 4 })          │
│  · resolve(): 从文件路径向上查找指令文件                     │
│  · find(): 在目录中查找 AGENTS.md/CLAUDE.md                 │
│                                                             │
│  远程获取: HttpClient + Effect.timeout(5000)                │
│  → 每个 URL 5 秒超时，失败静默跳过                           │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌─ SystemPrompt (session/system.ts) ─────────────────────────┐
│  Service 层:                                                │
│  · environment(): 生成环境信息（日期/OS/Git/目录）           │
│  · skills(): 加载当前 Agent 的 Skill 提示词                  │
│  · provider(): 生成 Provider 特定的提示词                    │
└────────────────────────────────────────────────────────────┘
```

## 6.3 关键触发点详解

### 触发点 1：Effect.forEach 并发 — 指令文件加载

**文件**：`session/instruction.ts:161-162`

```typescript
const files = yield* Effect.forEach(
  Array.from(paths), read, { concurrency: 8 }
)
const remote = yield* Effect.forEach(
  urls, fetch, { concurrency: 4 }
)
```

**自然语言解释**：指令文件可能来自多个本地路径和多个远程 URL。`Effect.forEach` 对每个路径/URL 执行 `read`/`fetch` Effect，`concurrency: 8` 表示最多 8 个本地文件同时读取，`concurrency: 4` 表示最多 4 个远程 URL 同时获取。这种并发控制既保证了速度（不会串行等待），又防止了资源耗尽（不会无限并发）。如果某个文件读取失败，`read` 内部的 `Effect.catch` 会静默跳过（返回空字符串），不影响其他文件的加载。

### 触发点 2：Effect.timeout — 远程 URL 超时保护

**文件**：`session/instruction.ts:94-98`

```typescript
const fetch = Effect.fnUntraced(function* (url: string) {
  const res = yield* http.execute(HttpClientRequest.get(url)).pipe(
    Effect.timeout(5000),
    Effect.catch(() => Effect.succeed(null)),
  )
  if (!res) return ""
  const body = yield* res.arrayBuffer.pipe(
    Effect.catch(() => Effect.succeed(new ArrayBuffer(0)))
  )
  return new TextDecoder().decode(body)
})
```

**自然语言解释**：远程指令 URL 可能很慢或不可达。`Effect.timeout(5000)` 为 HTTP 请求设置了 5 秒超时——如果 5 秒内未完成，Effect 会失败并触发 `Effect.catch`，返回 `null`（表示获取失败）。后续代码检查 `if (!res) return ""`，静默跳过失败的 URL。这种"超时 + 静默降级"的模式确保一个慢速 URL 不会阻塞整个会话启动。

### 触发点 3：Layer.suspend — 延迟依赖解析

**文件**：`session/session.ts`（Layer 定义）

```typescript
export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(SessionRunState.defaultLayer),
    Layer.provide(SessionStatus.defaultLayer),
    Layer.provide(SessionCompaction.defaultLayer),
    // ... 更多 Layer ...
  )
)
```

**自然语言解释**：`Layer.suspend` 延迟 Layer 的创建直到它第一次被使用。这解决了循环依赖问题——Session 的 Layer 依赖 Compaction 的 Layer，而 Compaction 的 Layer 又依赖 Session 的 Layer。`Layer.suspend` 将 Layer 的创建包装在 thunk 中，只有在运行时实际需要时才执行，此时所有依赖都已经可用。

### 触发点 4：serviceUse — 非 Effect 上下文中的服务访问

**文件**：`session/compaction.ts:212,641`

```typescript
export const use = serviceUse(Service)

// 在非 Effect 上下文中调用
const { runPromise } = makeRuntime(Service, defaultLayer)
export const isOverflow = (...) => runPromise((svc) => svc.isOverflow(...))
```

**自然语言解释**：`serviceUse` 生成一个 `use` 函数，允许在 Effect 上下文中通过 `yield* Service.use((svc) => svc.method())` 访问服务。对于需要在非 Effect 上下文中调用服务方法的场景，`makeRuntime` 创建轻量运行时，`runPromise` 执行服务方法。这两种模式互补——`use` 用于 Effect 内部，`makeRuntime` + `runPromise` 用于 Effect 外部。

### 触发点 5：Effect.option — 可选值处理

**文件**：`session/prompt.ts:277,304-305`

```typescript
const info = yield* fsys.stat(targetPath).pipe(Effect.option)
if (Option.isNone(info)) {
  // 文件不存在 → 返回错误提示
  parts.push(referenceTextPart({..., problem: "Path does not exist"}))
  return
}
```

**自然语言解释**：文件可能存在也可能不存在。`Effect.option` 将 Effect 的成功/失败转换为 `Option`（`Some(value)` 或 `None`）——文件存在 → `Some(stat)`，文件不存在 → `None`。然后用 `Option.isNone` 检查，不存在时返回错误提示。这比 try-catch 更类型安全——编译器知道你需要处理"不存在"的情况。

## 6.4 涉及的 Effect 方法

### `Effect.forEach(iterable, fn, { concurrency })`
**作用**：对可迭代对象中每个元素执行 Effect 函数，支持并发控制。

**本章使用场景**：指令文件并发加载（本地 8 并发、远程 4 并发）。

### `Effect.timeout(duration)`
**作用**：为 Effect 设置超时。超时后 Effect 失败。

**本章使用场景**：远程指令 URL 获取——5 秒超时保护。

### `Effect.catch(error, handler)`
**作用**：捕获特定错误类型并执行恢复逻辑。

**本章使用场景**：远程 URL 获取失败 → 静默跳过；文件读取失败 → 返回空字符串。

### `Effect.option`
**作用**：将 Effect 的成功/失败转换为 `Option` 类型。成功 → `Some(value)`，失败 → `None`。

**本章使用场景**：文件存在性检查——将"文件可能不存在"建模为 Option。

### `Option.isNone(option)` / `Option.isSome(option)`
**作用**：检查 Option 是 None 还是 Some。

**本章使用场景**：检查文件是否存在。

### `Layer.suspend(thunk)`
**作用**：延迟 Layer 的创建。thunk 只在 Layer 首次被使用时执行。

**本章使用场景**：解决 Session ↔ Compaction 的循环依赖。

### `Layer.provide(layer, target)`
**作用**：将 layer 的依赖注入到 target layer。

**本章使用场景**：组装各服务的 defaultLayer。

### `Layer.provideMerge(layer1, layer2, ...)`
**作用**：合并多个 Layer。

**本章使用场景**：组装完整的依赖注入图。

### `serviceUse(service)`
**作用**：生成服务的 `use` 访问器函数。

**本章使用场景**：Compaction、Project 等服务——在 Effect 上下文中访问服务方法。

### `makeRuntime(service, layer)`
**作用**：从单个服务+Layer 创建轻量运行时。

**本章使用场景**：Compaction 的独立运行时——不依赖全局 AppRuntime。

### `Effect.orDie`
**作用**：将错误转为缺陷。

**本章使用场景**：`instruction.system()` 中——指令加载失败被视为不可恢复。

## 6.5 本章小结

会话管理的 Effect 触发围绕"独立服务 + Layer 依赖注入"展开。每个子模块（Session CRUD、Compaction、Instruction、SystemPrompt）是独立的 Effect 服务，通过 Layer 声明依赖，由运行时自动注入。`Effect.forEach` 的并发控制让指令文件加载既快又安全，`Effect.timeout` + `Effect.catch` 实现远程 URL 的超时降级，`Layer.suspend` 解决循环依赖，`serviceUse` + `makeRuntime` 提供 Effect 内外的服务访问方式。

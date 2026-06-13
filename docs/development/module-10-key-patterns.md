# 模块 10 · 关键设计模式与编码约定

本章总结 opencode 代码库中反复出现的设计模式和编码约定，帮助新开发者快速理解代码风格并写出一致的代码。

## 10.1 Effect-TS 使用模式

### 效应函数定义

opencode 大量使用 Effect-TS 的 `Effect.fn` 和 `Effect.gen`：

```typescript
// Effect.fn：命名的类型安全函数
const myFunc = Effect.fn("MyModule.myFunc")(function* () {
  const dep = yield* SomeDependency
  const result = yield* dep.doSomething()
  return result
})

// Effect.gen：生成器风格的效应组合
const result = yield* Effect.gen(function* () {
  const a = yield* step1()
  const b = yield* step2(a)
  return b
})
```

### Layer 依赖注入

依赖通过 Layer 系统注入：

```typescript
// 定义服务
export class MyService extends Context.Service<MyService, Interface>()("MyService") {}

// 创建 Layer
export const layer = Layer.effect(MyService, Effect.gen(function* () {
  const dep = yield* SomeDependency
  return MyService.of({ ... })
}))

// 使用
const result = yield* MyService.use((svc) => svc.doSomething())
```

### Schema 定义

使用 Effect Schema 定义数据类型（同时用于验证和 TypeScript 类型推导）：

```typescript
import { Schema } from "effect"

const MyStruct = Schema.Struct({
  id: Schema.String,
  count: Schema.Number,
  tags: Schema.Array(Schema.String),
})

type MyStruct = Schema.Schema.Type<typeof MyStruct>
```

## 10.2 事件驱动模式

### 事件定义

使用 `event.ts` 中的 `define()` 定义新事件：

```typescript
const MyEvent = define("my.event", 1, Schema.Struct({
  sessionID: Schema.String,
  data: Schema.String,
}))
```

### 事件发布

通过 Event Bus 发布事件：

```typescript
bus.publish(MyEvent.make({ sessionID, data }))
```

### 事件订阅

消费者订阅事件流：

```typescript
for await (const event of events.stream) {
  if (event.type === "my.event") {
    // 处理事件
  }
}
```

## 10.3 工具注册模式

### 工具定义

每个工具文件导出 Schema 和 execute 函数：

```typescript
// tool/my-tool.ts
export const MyTool = Tool.make({
  description: "Does something useful",
  parameters: Schema.Struct({ ... }),
  success: Schema.Struct({ ... }),
  execute: (params) => Effect.gen(function* () {
    // 执行逻辑
    return result
  }),
})
```

### 工具注册

在 `tool/registry.ts` 中注册新工具：

```typescript
export const TOOL_REGISTRY = {
  ...existing,
  my_tool: MyTool,
}
```

### 工具 UI 渲染

在 `cli/cmd/run/tool.ts` 的 `TOOL_RULES` 中添加渲染规则：

```typescript
const TOOL_RULES = {
  ...existing,
  my_tool: {
    view: { output: true, final: true },
    run: (p) => ({ icon: "→", title: `My Tool: ${p.input.param}` }),
    scroll: {
      final: (p) => `my_tool completed · ${span(p.frame.state)}`,
    },
  },
}
```

## 10.4 Agent 定义模式

### 内置 Agent

在 `agent/` 目录下创建 Agent 定义文件，导出符合 `Agent.Info` 接口的对象。

### 自定义 Agent

在 `.opencode/agents/` 目录下创建 YAML/Markdown 文件：

```markdown
---
description: My custom agent for specific tasks
mode: primary
permission:
  bash: allow
  edit: allow
  read: allow
model: anthropic/claude-sonnet-4-6
---

Your system prompt here...
```

## 10.5 编码约定

### 文件命名

- TypeScript 源文件：`kebab-case.ts`
- React/TSX 组件：`kebab-case.tsx`
- 测试文件：`<feature>.test.ts`
- 文档文件：`UPPER-CASE.md`（AGENTS.md、README.md 等）

### 导入约定

- 包内导入使用 `@/` 别名（指向 `src/`）
- 跨包导入使用包名（`@opencode-ai/core`、`@opencode-ai/llm`）
- 第三方导入使用 npm 包名

### 类型导出

- 每个模块导出 `export * as ModuleName from "./module-name"` 形式的命名空间
- 公共 API 通过 `index.ts` 统一导出

### 错误处理

- 使用 Effect 的类型化错误（`Effect<Success, Error, Requirements>`）
- 避免抛出裸 Error（除非在 Effect 外部）
- 工具错误使用 `ToolFailure`

### 日志约定

- 使用 `Log.create({ service: "module-name" })` 创建 Logger
- 关键操作记录 INFO 日志
- 中间状态记录 DEBUG 日志
- 异常记录 ERROR 日志

### 测试约定

- 使用 Bun 内置测试框架
- 测试文件放在 `test/` 目录
- 使用 `describe`/`it` 组织测试
- 外部 API 调用使用 http-recorder 录制/回放

---

## 本章小结

opencode 的关键设计模式包括：Effect-TS 效应函数 + Layer 依赖注入、事件驱动（define → publish → subscribe）、工具注册（Schema + execute + UI 规则）、Agent 定义（内置 + 自定义）。编码约定涵盖文件命名、导入路径、类型导出、错误处理和日志规范。遵循这些模式和约定是写出与现有代码风格一致的代码的关键。

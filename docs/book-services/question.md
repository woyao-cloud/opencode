# @opencode/Question — 提问服务
> 婧愭枃浠? `opencode/packages/opencode/src/question/index.ts`

## 概述

`@opencode/Question` 实现了 AI Agent 向用户提问的交互机制。当 AI 在对话中需要用户做出选择或确认时，通过该服务发布问题、等待用户回复或拒绝。它基于 Effect 的 `Deferred` 原语实现请求-响应模式，通过 `Bus` 事件系统发布问题状态变更。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Bus` | `@opencode/Bus` | 事件总线，发布 `question.asked`、`question.replied`、`question.rejected` 事件 |

```typescript
// index.ts layer 定义
export const layer = Layer.effect(Service, Effect.gen(function* () {
  const bus = yield* Bus.Service
  // ...
}))
```

## 核心接口

```typescript
export interface Interface {
  readonly ask: (input: {
    sessionID: SessionID
    questions: ReadonlyArray<Info>
    tool?: Tool
  }) => Effect.Effect<ReadonlyArray<Answer>, RejectedError>
  readonly reply: (input: { requestID: QuestionID; answers: ReadonlyArray<Answer> }) => Effect.Effect<void>
  readonly reject: (requestID: QuestionID) => Effect.Effect<void>
  readonly list: () => Effect.Effect<ReadonlyArray<Request>>
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/Question") {}
```

使用示例：

```typescript
// Agent 向用户提问
const answers = yield* Question.Service.ask({
  sessionID: "ses_abc123",
  questions: [
    { question: "Which file should I modify?", header: "File", options: [
      { label: "config.ts", description: "Main configuration file" },
      { label: "main.ts", description: "Entry point" }
    ]}
  ]
})

// UI 层回复
yield* Question.Service.reply({
  requestID: "q_xyz789",
  answers: [["config.ts"]]
})
```

## 数据结构

### Info（问题定义）

```typescript
export class Info extends Schema.Class<Info>("QuestionInfo")({
  question: Schema.String,           // 完整问题
  header: Schema.String,             // 简短标签（最长 30 字符）
  options: Schema.Array(Option),     // 可选选项
  multiple: Schema.optional(Schema.Boolean),  // 允许多选
  custom: Schema.optional(Schema.Boolean),    // 允许自定义答案（默认 true）
})
```

### Option（选项）

```typescript
export class Option extends Schema.Class<Option>("QuestionOption")({
  label: Schema.String,              // 显示文本（1-5 个词）
  description: Schema.String,        // 选项说明
})
```

### Request（请求）

```typescript
export class Request extends Schema.Class<Request>("QuestionRequest")({
  id: QuestionID,
  sessionID: SessionID,
  questions: Schema.Array(Info),
  tool: Schema.optional(Tool),       // 关联的工具调用（可选）
})
```

### 其他类型

| 类型 | 说明 |
|------|------|
| `Answer` | `string[]`，用户对一个问题的回答（选中的 label 数组） |
| `Reply` | `{ answers: Answer[] }`，按问题顺序排列的回答 |
| `Tool` | `{ messageID, callID }`，关联的工具调用信息 |
| `RejectedError` | 用户拒绝回答时抛出的错误 |

### 事件

```typescript
export const Event = {
  Asked: BusEvent.define("question.asked", Request),
  Replied: BusEvent.define("question.replied", Replied),
  Rejected: BusEvent.define("question.rejected", Rejected),
}
```

## 关键实现细节

### 请求-响应生命周期

```
ask()
  ├── 1. 生成 QuestionID（递增 ID）
  ├── 2. 创建 Deferred（Effect 的 Promise 原语）
  ├── 3. 将 { info, deferred } 存入 pending Map
  ├── 4. 发布 Event.Asked → Bus
  └── 5. 等待 Deferred.await
        ├── reply() → Deferred.succeed(answers) → 发布 Event.Replied
        └── reject() → Deferred.fail(RejectedError) → 发布 Event.Rejected
```

### 实例绑定

问题状态通过 `InstanceState` 与项目实例绑定，每个实例有独立的 `pending` Map。实例销毁时，所有未完成的 `Deferred` 会被自动 fail：

```typescript
yield* Effect.addFinalizer(() =>
  Effect.gen(function* () {
    for (const item of state.pending.values()) {
      yield* Deferred.fail(item.deferred, new RejectedError())
    }
    state.pending.clear()
  }),
)
```

### ask/reply 解耦

`ask` 是阻塞式的（等待 Deferred），`reply` 和 `reject` 是非阻塞的。这允许：
- Agent 端调用 `ask` 后等待用户响应
- UI 端通过 `reply`/`reject` 异步提交结果
- 通过 Bus 事件通知其他模块状态变更

## 关键设计决策

1. **Deferred 模式**：使用 Effect 的 `Deferred` 原语实现异步等待，比传统的 callback/promise 模式更契合 Effect 的纤维模型

2. **Bus 事件解耦**：ask/reply/reject 操作均发布 Bus 事件，允许 UI 层和其他模块独立监听状态变化

3. **自动清理**：通过 `Effect.addFinalizer` 确保实例销毁时所有未完成的请求都被正确释放，防止内存泄漏

4. **递增 ID**：使用 `QuestionID.ascending()` 生成有序 ID，便于排序和追踪

5. **可选 Tool 关联**：`Tool` 字段允许将问题关联到特定的工具调用，方便 UI 展示上下文

6. **单依赖设计**：仅依赖 `Bus` Service，保持模块简洁和低耦合

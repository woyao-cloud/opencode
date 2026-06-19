# 第 8 章：上下文管理

> **本章目标**：理解 opencode 的消息模型——Part 联合类型、增量更新模式、记忆状态机，以及上下文溢出检测机制。
> **涉及文件**：`packages/opencode/src/session/message-v2.ts`、`overflow.ts`、`packages/core/src/session-message-updater.ts`
> **必备知识**：LLM 上下文窗口概念、Token 计算基础

---

## 8.1 场景引入：当对话越来越长

你正在用 opencode 重构一个大型模块。对话已经持续了两小时，产生了 200 条消息。每次 LLM 调用，opencode 都需要把整个对话历史发送给 LLM——包括你的每次输入、AI 的每次回复、每次工具调用的结果。

问题是：LLM 的上下文窗口是有限的。Anthropic Claude 支持 200K token，OpenAI GPT-4 支持 128K，Google Gemini 支持 1M——但不管多大，长对话总会触及上限。

当 token 数量接近上限时，opencode 必须做出选择：哪些消息保留？哪些压缩？哪些丢弃？这个选择直接影响 AI 的回答质量——丢弃了关键上下文，AI 就会"失忆"。

上下文管理的核心就是：**在有限的 token 预算内，保留最有价值的信息**。

---

## 8.2 核心概念

### 消息模型：Part 联合类型

opencode 的消息不是简单的"用户说 X，AI 回 Y"。一条 AI 消息由多个 **Part**（片段）组成：

```typescript
// 简化的 Part 联合类型
type Part =
  | TextPart        // { type: "text", text: string, time: { start, end? } }
  | ToolPart        // { type: "tool", tool: string, state: { status, input, output? } }
  | ReasoningPart   // { type: "reasoning", text: string, time: { start, end? } }
  | StepPart        // { type: "step-start" | "step-finish" }
  | FilePart        // { type: "file", mediaType: string, url: string }
  | CompactionPart  // { type: "compaction", summary: string }
```

一条典型的 AI 回复可能包含：

```
[step-start] → [reasoning: "我需要先理解认证模块..."] → [text: "让我看看..."] → [tool: read("auth.ts")] → [text: "我发现了问题..."] → [step-finish]
```

这种 Part 模型的好处是：你可以精确控制每个片段的生命周期。比如压缩时，你可以保留 `text` 和 `reasoning`，但丢弃 `tool` 的详细输出（因为工具结果已经体现在后续文本中）。

### 增量更新：updatePartDelta()

LLM 的响应是流式的——文本不是一次性到达，而是一个 token 一个 token 地到达。opencode 使用 `updatePartDelta()` 实现增量更新：

```typescript
// 第一个 text-delta 事件：创建 TextPart
updatePartDelta(messageID, { type: "text", text: "我" })

// 第二个 text-delta 事件：追加到同一个 TextPart
updatePartDelta(messageID, { type: "text", text: "来" })

// 第三个 text-delta 事件：继续追加
updatePartDelta(messageID, { type: "text", text: "帮" })

// text-end 事件：标记完成
updatePartDelta(messageID, { type: "text", text: "你", time: { end: Date.now() } })
```

这种增量更新避免了"每个 token 创建一个新 Part"的内存浪费，同时让 UI 可以实时显示生成中的文本。

### 记忆状态机

`packages/core/src/session-message-updater.ts` 的 `memory()` 函数管理消息的"记忆状态"。它维护两个关键索引：

- **`activeAssistantIndex`** — 当前活跃的 AI 消息索引（正在生成中的消息）
- **`activeCompactionIndex`** — 压缩消息的索引（被压缩替换的原始消息范围）

当压缩发生时，`activeCompactionIndex` 标记被替换的消息范围，后续 LLM 调用不再发送这些消息，而是发送压缩摘要。

### 上下文溢出检测

`packages/opencode/src/session/overflow.ts` 的 `isOverflow()` 函数判断当前 token 使用量是否超过上下文窗口：

```typescript
export function isOverflow(input: {
  cfg: Config.Info
  tokens: MessageV2.Assistant["tokens"]
  model: Provider.Model
}) {
  if (input.cfg.compaction?.auto === false) return false  // 用户禁用了自动压缩
  if (input.model.limit.context === 0) return false       // 模型无上下文限制

  const count = input.tokens.total
    || input.tokens.input + input.tokens.output + input.tokens.cache.read + input.tokens.cache.write
  return count >= usable(input)  // 比较当前用量和可用窗口
}
```

`usable()` 计算实际可用的 token 数：从模型上下文窗口减去 `COMPACTION_BUFFER`（20K token 的压缩缓冲区）和最大输出 token 数。这保证了检测到溢出时还有足够的空间执行压缩。

---

## 8.3 Effect-TS 函数详解

### `Schema.Union` / `Schema.Literal` — 联合类型与标签类型

```
类型签名（简化）:
  Schema.Union([Schema1, Schema2, ...]): Schema<A1 | A2 | ...>
  Schema.Literal("value"): Schema<"value">
```

**用途**：定义带标签的联合类型（Discriminated Union）。`Schema.Literal` 创建字面量类型，`Schema.Union` 组合多个带不同 `_tag` 或 `type` 字段的结构。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：联合类型，但没有运行时验证
type Part = TextPart | ToolPart | ReasoningPart
// 运行时你无法验证一个对象是不是有效的 Part

// Effect-TS：Schema.Union 提供编译期 + 运行时双重验证
const Part = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String, ... }),
  Schema.Struct({ type: Schema.Literal("tool"), tool: Schema.String, ... }),
  // ...
])
// Schema.decodeUnknownEffect(Part)(unknownData) → 验证 + 类型收窄
```

**在 opencode 中的使用**：`MessageV2` 的 Part 类型通过 `Schema.Union` 定义，`SessionStatus` 的 idle/busy/retry 三态也通过 `Schema.Union` 定义。

### `Schema.brand` — 品牌类型

```
类型签名（简化）:
  Schema.brand(Schema.String, "BrandName"): Schema<string & { readonly __brand: "BrandName" }>
```

**用途**：创建名义类型（Nominal Type）。在 TypeScript 的结构类型系统中，两个 `string` 可以互相赋值。品牌类型通过交叉一个 phantom type 阻止这种意外赋值。

**在 opencode 中的使用**：`SessionID`、`MessageID`、`PartID`、`ProjectID`、`ProviderID`、`ModelID` 都是品牌类型。

### `Option` — 可选值处理

```
类型签名（简化）:
  Option<A> = Some<A> | None
  Option.fromNullable(value): Option<A>
  Option.match(option, { onSome, onNone }): B
```

**用途**：类型安全的可选值。与 `null | undefined` 不同，`Option` 强制你处理两种情况。

**与普通 TypeScript 的对比**：

```typescript
// 普通 TS：null/undefined 容易忘记检查
function getSession(id: string): Session | undefined { ... }
const session = getSession("123")
session.title  // 编译通过，但运行时可能 TypeError!

// Effect-TS：Option 强制处理
function getSession(id: string): Effect<Option<Session>, Error> { ... }
const opt = yield* _(getSession("123"))
Option.match(opt, {
  onSome: (session) => useSession(session),
  onNone: () => handleNotFound(),
})
```

**在 opencode 中的使用**：`session.ts` 中大量使用 `Option` 处理可能不存在的查询结果。

### `Effect.catchIf` — 条件错误捕获

```
类型签名（简化）:
  Effect.catchIf(effect, predicate: (e: E) => boolean, handler: (e: E) => Effect<A2, E2, R2>)
```

**用途**：按条件捕获特定错误。比 `catchTag` 更灵活（可以用任意条件判断），比 `catchAll` 更精确（只捕获满足条件的错误）。

**在 opencode 中的使用**：`session.ts` 中用 `Effect.catchIf(NotFoundError.isInstance, ...)` 将"找不到"转为 `undefined`。

### `Config` / `ConfigProvider` — 环境配置

```
类型签名（简化）:
  Config.string(name: string): Config<string>
  Config.boolean(name: string): Config<boolean>
  Config.withDefault(config, defaultValue): Config<A>
```

**用途**：声明式读取环境变量或配置。`Config` 描述"需要什么配置"，`ConfigProvider` 提供实际值。

**在 opencode 中的使用**：`RuntimeFlags.Service` 通过 `ConfigService` 定义了 20+ 个配置项（如 `OPENCODE_AUTO_SHARE`、`OPENCODE_EXPERIMENTAL_CONTINUE_LOOP_ON_DENY`）。

---

## 8.4 实现剖析

### 消息增量更新的 Effect 实现

`MessageV2.updatePartDelta()` 是消息系统中调用最频繁的方法。每次 LLM 的 text-delta 事件到达时，它被调用一次：

```typescript
// 简化的 updatePartDelta 逻辑
updatePartDelta(messageID, delta) {
  return Effect.gen(function* (_) {
    // 1. 查找消息
    const message = yield* _(findMessage(messageID))

    // 2. 查找或创建 Part
    let part = message.parts.find(p => p.id === delta.id)
    if (!part) {
      part = createPart(delta)
      message.parts.push(part)
    }

    // 3. 应用增量更新
    if (delta.type === "text") {
      part.text += delta.text  // 追加文本
    }
    if (delta.time?.end) {
      part.time.end = delta.time.end  // 标记完成
    }

    // 4. 持久化到数据库
    yield* _(db.update(PartTable).set(part).where(eq(PartTable.id, part.id)))

    // 5. 发布事件（通知 UI）
    yield* _(bus.publish(MessagePartUpdated, { part }))
  })
}
```

### 上下文溢出检测的多提供商适配

不同提供商的上下文窗口差异巨大。`overflow.ts` 的 `usable()` 函数通过 `input.model.limit.context` 和 `input.model.limit.input` 适配不同模型：

- **Anthropic Claude**: context = 200K, input limit 可能小于 context
- **OpenAI GPT-4**: context = 128K
- **Google Gemini**: context = 1M
- **Groq**: context 较小，需要更激进的压缩策略

`isOverflow()` 不关心具体是哪个提供商——它只比较当前 token 数和可用窗口。提供商差异被抽象在 `Provider.Model` 的 `limit` 字段中。

---

## 8.5 开发人员必备知识与技能

1. **Token 计算原理** — LLM 的 token 不是"一个单词 = 一个 token"。不同模型使用不同的 tokenizer（如 Anthropic 的 Claude tokenizer、OpenAI 的 tiktoken）。粗略估算：英文 1 token ≈ 0.75 个单词，中文 1 token ≈ 0.5 个汉字。

2. **上下文窗口管理策略** — 常见的策略有：滑动窗口（保留最近 N 条消息）、摘要压缩（用 LLM 生成历史摘要）、选择性丢弃（保留关键消息，丢弃冗余内容）。opencode 使用摘要压缩 + 选择性丢弃的组合。

3. **消息模型设计** — Part 联合类型的设计让每条消息的每个片段都可以独立追踪和更新。设计消息系统时，考虑消息的粒度：太粗（整条消息不可拆分）难以增量更新，太细（每个 token 一个 Part）存储开销大。

4. **增量更新模式** — `updatePartDelta` 是"追加式更新"而非"替换式更新"。这种模式适合流式数据（LLM 输出、日志、实时指标），不适合需要原子替换的场景。

---

## 8.6 本章小结

- opencode 的消息由多个 Part 组成：TextPart、ToolPart、ReasoningPart、StepPart、FilePart、CompactionPart
- `updatePartDelta()` 实现增量更新——每个 LLM token 到达时追加到现有 Part，而非创建新 Part
- 记忆状态机通过 `activeAssistantIndex` 和 `activeCompactionIndex` 追踪消息的活跃状态
- `isOverflow()` 比较当前 token 用量和模型上下文窗口，预留 20K token 压缩缓冲区
- `Schema.Union` + `Schema.Literal` 定义带标签的联合类型，`Schema.brand` 创建品牌类型防止 ID 混淆
- `Option` 强制处理"可能存在也可能不存在"的值，`Effect.catchIf` 按条件精确捕获错误

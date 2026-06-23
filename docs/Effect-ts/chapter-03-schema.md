# 第 3 章: Schema 运行时类型安全

## 1. 本章目标

完成本章学习后，你将能够：

- 理解 Schema 的核心价值：将 TypeScript 编译时类型"延续"到运行时
- 使用 `Schema.Struct` 定义带校验的数据结构
- 使用 `Schema.Class` 创建带实例方法和运行时校验的类
- 使用 `Schema.check` + `Schema.is*` 谓词实现字段级约束
- 使用 `decodeUnknownSync` / `decodeUnknownEffect` 进行运行时数据校验
- 使用 `Schema.TaggedStruct` + `Schema.toTaggedUnion` 构建可区分联合
- 理解 `.Type` 与 `.Encoded` 的区别，以及 Schema 作为"单一真相源"的实践

## 2. 前置知识

阅读本章前，你需要掌握：

- **第 2 章内容:** `Effect<R, E, A>` 类型模型、`pipe` 管道组合、`Effect.runSync` 运行方式
- **TypeScript 类型基础:** interface、type、泛型、字面量类型
- **TypeScript 编译模型认知:** 理解 TypeScript 类型在编译为 JavaScript 后完全消失

本章不需要了解 Context、Layer、Stream 等高级概念。

## 3. 概念讲解

### 3.1 为什么需要 Schema：TypeScript 类型的"运行时真空"

TypeScript 的类型系统是"编译时"的。当你写下：

```typescript
interface User {
  name: string
  age: number
}

function processUser(data: unknown): User {
  return data as User  // 类型断言 — 零运行时保障
}
```

编译后的 JavaScript 中，`User` 接口完全消失。`as User` 断言不产生任何运行时检查。如果 API 返回了 `{ name: 123, age: "abc" }`，TypeScript 不会阻止它进入你的系统。

**Effect-TS Schema 填补了这个真空**。Schema 既是 TypeScript 类型定义，也是运行时校验器：

```typescript
const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

// 编译时：推导出 User 类型
type User = typeof UserSchema.Type  // { readonly name: string; readonly age: number }

// 运行时：校验数据
const user = Schema.decodeUnknownSync(UserSchema)(apiResponse)
// 如果 apiResponse 不符合结构，会抛出详细错误
```

**核心哲学:** Schema 是"单一真相源"（Single Source of Truth）。你在一处定义结构，同时获得编译时类型检查和运行时数据校验，彻底消除"类型定义和校验逻辑不同步"的问题。

### 3.2 Schema.Struct — 结构化数据定义

`Schema.Struct` 是 Schema 系统中最基础的构造器，用于定义具有固定字段的结构化数据。

```typescript
const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})

type User = typeof UserSchema.Type
// { readonly name: string; readonly age: number; readonly email: string }
```

**核心原语类型:**

| Schema 类型 | 对应 TypeScript 类型 | 说明 |
|-------------|---------------------|------|
| `Schema.String` | `string` | 字符串 |
| `Schema.Number` | `number` | 数字 |
| `Schema.Boolean` | `boolean` | 布尔值 |
| `Schema.Literal("a", "b")` | `"a" \| "b"` | 字面量联合 |
| `Schema.Unknown` | `unknown` | 任意类型 |

**复合类型:**

```typescript
// 可选字段
Schema.optional(Schema.String)    // → string | undefined

// 数组
Schema.Array(Schema.String)       // → readonly string[]

// 字典/映射
Schema.Record(Schema.String, Schema.Unknown)  // → { readonly [x: string]: unknown }
```

#### 运行时校验

Schema 提供多层次的校验 API：

**同步校验（最常用）:**

```typescript
// decodeUnknownSync — 接收 unknown，返回类型安全值或抛出错误
const user = Schema.decodeUnknownSync(UserSchema)(apiData)

// decodeUnknownOption — 返回 Option，不抛异常
const maybeUser = Schema.decodeUnknownOption(UserSchema)(apiData)
// Option.isSome(maybeUser) → 校验通过
// Option.isNone(maybeUser) → 校验失败
```

**Effect 原生集成:**

```typescript
// decodeUnknownEffect — 返回 Effect，可无缝集成 Effect 管道
const program = pipe(
  Schema.decodeUnknownEffect(UserSchema)(apiData),
  Effect.map((user) => user.name),
)
```

### 3.3 字段级约束 — Schema.check 与 Schema.is* 谓词

仅定义字段类型还不够，我们经常需要对字段值施加进一步约束（正数、字符串长度、整数等）。Effect Schema 使用 `Schema.check` 配合 `Schema.is*` 系列谓词函数实现字段级约束。

```typescript
// 正数约束
const PositiveNumber = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThan(0))
)

// 整数约束
const Integer = Schema.Number.pipe(
  Schema.check(Schema.isInt())
)

// 字符串最小长度
const NonEmptyName = Schema.String.pipe(
  Schema.check(Schema.isMinLength(2))
)

// 组合多个约束
const AgeField = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0)),
  Schema.check(Schema.isLessThanOrEqualTo(150)),
)

// 在 Struct 中使用
const ProductSchema = Schema.Struct({
  name: NonEmptyName,
  price: PositiveNumber,
  age: AgeField,
})
```

**常用 Schema.is* 谓词:**

| 谓词 | 用途 |
|------|------|
| `Schema.isGreaterThan(n)` | 大于 n |
| `Schema.isGreaterThanOrEqualTo(n)` | 大于等于 n |
| `Schema.isLessThan(n)` | 小于 n |
| `Schema.isLessThanOrEqualTo(n)` | 小于等于 n |
| `Schema.isInt()` | 是否为整数 |
| `Schema.isMinLength(n)` | 字符串最小长度 |
| `Schema.isMaxLength(n)` | 字符串最大长度 |
| `Schema.isNonEmpty()` | 非空字符串 |
| `Schema.isPattern(regex)` | 正则匹配 |

约束校验失败时，Schema 会抛出包含字段路径和具体原因的详细错误信息。

### 3.4 Schema.Class — 类风格定义

`Schema.Class` 将 Schema 定义与 JavaScript 类绑定，让你在一个地方同时获得：

- 运行时数据校验
- TypeScript 类型推导
- 构造函数
- 实例方法和计算属性

```typescript
class User extends Schema.Class<User>("User")({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  email: Schema.String,
}) {
  // 实例方法 / 计算属性
  get displayName(): string {
    return `${this.name} (${this.age}岁)`
  }

  get isAdult(): boolean {
    return this.age >= 18
  }

  // 静态工厂方法
  static from(input: unknown): User {
    return Schema.decodeUnknownSync(User)(input)
  }
}

// 使用构造函数创建（会自动校验）
const user = new User({ name: "张三", age: 28, email: "z@e.com" })

// 使用静态工厂从 unknown 数据创建
const user2 = User.from(apiResponse)
```

**对比普通 TypeScript class:**

| 特性 | Schema.Class | 普通 class |
|------|-------------|-----------|
| 运行时校验 | 自动 | 无 |
| 类型推导 | 自动 | 手动声明 |
| 构造函数校验 | 是 | 否 |
| 实例方法 | 支持 | 支持 |
| 序列化支持 | `encodeSync` / `encodeUnknownSync` | 无 |

### 3.5 带 Tag 的结构体 — Schema.TaggedStruct 与可区分联合

`Schema.TaggedStruct` 创建一个带有 `_tag` 字段的结构体，`_tag` 的值固定为指定的字符串字面量。这是构建可区分联合（discriminated union）的标准方式。

```typescript
const OrderCreated = Schema.TaggedStruct("OrderCreated", {
  orderId: Schema.String,
  amount: Schema.Number,
})

const OrderCancelled = Schema.TaggedStruct("OrderCancelled", {
  orderId: Schema.String,
  reason: Schema.String,
})
```

生成的类型自动包含 `_tag` 字段：

```typescript
type OrderCreatedType = typeof OrderCreated.Type
// { readonly _tag: "OrderCreated"; readonly orderId: string; readonly amount: number }
```

**构建可区分联合:**

```typescript
const OrderEvent = Schema.Union([
  OrderCreated,
  OrderCancelled,
]).pipe(Schema.toTaggedUnion("_tag"))

// 运行时根据 _tag 自动识别具体类型
const event = Schema.decodeUnknownSync(OrderEvent)({
  _tag: "OrderCreated",
  orderId: "ORD-003",
  amount: 199.9,
})
```

这个模式在 OpenCode 项目中被大量使用。`packages/llm/src/schema/events.ts` 中定义了 16 种 LLM 事件类型（`TextStart`、`TextDelta`、`ToolCall`、`StepFinish` 等），通过 `Schema.toTaggedUnion("type")` 组合为一个可区分的 `LLMEvent` 联合类型。

### 3.6 Schema.Class 的带 Tag 错误模式

在 Effect-TS 的 Effect 错误通道中，推荐使用带 `_tag` 字段的错误类型，以便进行精确的错误类型匹配。

```typescript
class ValidationError extends Schema.Class<ValidationError>("ValidationError")({
  _tag: Schema.Literal("ValidationError"),
  message: Schema.String,
  field: Schema.optional(Schema.String),
  value: Schema.optional(Schema.Unknown),
}) {
  get description(): string {
    return `[${this._tag}] ${this.message}`
  }
}
```

**OpenCode 实战模式参考:** `packages/llm/src/schema/events.ts` 中的 `Usage` 类展示了 `Schema.Class` 在生产环境中的典型用法：

```typescript
class Usage extends Schema.Class<Usage>("LLM.Usage")({
  inputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number),
  reasoningTokens: Schema.optional(Schema.Number),
  // ...
}) {
  get visibleOutputTokens() {
    return Math.max(0, (this.outputTokens ?? 0) - (this.reasoningTokens ?? 0))
  }

  static from(input: UsageInput) {
    return input instanceof Usage ? input : new Usage(input)
  }
}
```

核心模式要点：
1. `Schema.Class` 定义字段结构
2. getter 提供计算属性（如 `visibleOutputTokens`）
3. 静态方法提供便捷构造器（如 `from`）
4. `Schema.optional` 处理可选字段

### 3.7 编码与解码：Schema 的双向能力

每个 Schema 实际上定义了两个方向：

1. **解码（Decode）:** 外部"不安全的"数据 → 类型安全的内部表示
2. **编码（Encode）:** 类型安全的内部表示 → 外部"传输"格式

对于大多数简单 Schema（如 `Schema.Struct({ name: Schema.String })`），编码和解码是相同的。但当 Schema 包含变换时，两者会产生差异。

#### NumberFromString — 典型的双向变换

```typescript
const PriceSchema = Schema.NumberFromString

// 解码: string → number
Schema.decodeUnknownSync(PriceSchema)("99.90")  // → 99.90 (number)

// 编码: number → string
Schema.encodeSync(PriceSchema)(99.90)            // → "99.9" (string)
```

#### 编解码 API 速查

| API | 输入 | 输出 | 失败行为 |
|-----|------|------|----------|
| `decodeUnknownSync(schema)(data)` | `unknown` | 类型安全值 | 抛异常 |
| `decodeUnknownEffect(schema)(data)` | `unknown` | `Effect<never, Error, A>` | Effect 错误通道 |
| `decodeUnknownOption(schema)(data)` | `unknown` | `Option<A>` | 返回 None |
| `decodeUnknownPromise(schema)(data)` | `unknown` | `Promise<A>` | Promise reject |
| `encodeUnknownSync(schema)(data)` | `unknown` | 编码后值 | 抛异常 |
| `encodeSync(schema)(data)` | 类型安全值 | 编码后值 | 抛异常（需有 transform） |

### 3.8 Type 与 Encoded — 两种类型视角

每个 Schema 提供两种 TypeScript 类型：

- **`typeof schema.Type`:** 解码后的"内部"类型 — 你在应用代码中使用的类型
- **`typeof schema.Encoded`:** 编码后的"外部"类型 — 网络传输或存储时的类型

对于没有变换的简单 Schema，两者相同。对于包含 `NumberFromString`、`DateFromString` 等变换的 Schema，两者不同：

```typescript
const Schema = Schema.Struct({
  price: Schema.NumberFromString,  // Encoded: string, Type: number
  createdAt: Schema.DateFromString, // Encoded: string, Type: Date
})

type Internal = typeof Schema.Type
// { readonly price: number; readonly createdAt: Date }

type External = typeof Schema.Encoded
// { readonly price: string; readonly createdAt: string }
```

**常见陷阱:** 混淆 `.Type` 和 `.Encoded`。当你定义 API 响应类型时，应该使用 `.Encoded`（因为 API 返回的是原始 JSON 格式）；在应用内部处理数据时，应该使用 `.Type`。

### 3.9 Standard Schema V1 兼容

Effect Schema 通过 `Schema.toStandardSchemaV1` 支持 [Standard Schema](https://github.com/standard-schema/standard-schema) 规范，使得 Effect Schema 可以与 Zod、Valibot 等同样支持该规范的库互操作。

```typescript
const standardSchema = Schema.toStandardSchemaV1(UserSchema)
// 通过 "~standard" 属性访问标准接口
const { version, vendor, validate } = standardSchema["~standard"]
// version: 1, vendor: "effect"

const result = validate(data)
// 返回 { issues: [...] } 或校验后的值
```

## 4. 代码示例

本章配套 4 个可独立运行的示例文件，位于 `demos/ch03-schema/src/` 目录下。建议按顺序阅读和运行。

**运行环境准备:**

```bash
cd demos/ch03-schema
bun install
```

### 4.1 `01-basic-struct.ts` — Schema.Struct 基础

**运行:** `bun run src/01-basic-struct.ts`

这个文件是 Schema 系统的入口，演示了结构化定义和运行时校验的核心用法。

**代码结构解析:**

**第 14-22 行 — Schema.Struct 基础定义:**
```typescript
const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.String,
})
```
`Schema.Struct` 同时生成 TypeScript 类型（`typeof UserSchema.Type`）和运行时校验器。用 `decodeUnknownSync` 从 `unknown` 数据解码，合法数据通过，非法数据抛出详细错误。

**第 37-47 行 — Schema.optional:**
```typescript
const ProfileSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  bio: Schema.optional(Schema.String),
})
```
`Schema.optional` 表示字段可选。缺少 `bio` 字段的数据可以通过校验，提供 `bio` 字段的数据也可以。

**第 52-68 行 — Schema.Literal:**
```typescript
const StatusSchema = Schema.Struct({
  status: Schema.Literal("active", "inactive", "suspended"),
})
```
`Schema.Literal` 限制字段只能取指定的字面量值。`"deleted"` 不在允许列表中，运行时被拒绝并给出清晰的错误信息。

**第 72-85 行 — Schema.Array 与 Schema.Record:**
```typescript
members: Schema.Array(Schema.String),
metadata: Schema.Record(Schema.String, Schema.Unknown),
```
`Schema.Array` 创建数组字段，`Schema.Record` 创建键值对映射。`Schema.Unknown` 表示值可以是任意类型。

**第 89-110 行 — 数值约束:**
```typescript
const PositiveNumber = Schema.Number.pipe(
  Schema.check(Schema.isGreaterThan(0))
)
```
使用 `Schema.check` 配合 `Schema.isGreaterThan` 谓词创建"必须大于 0"的约束。多个约束可以链式组合（如 `isGreaterThanOrEqualTo(0)` + `isLessThanOrEqualTo(150)`）。

**第 126-143 行 — 错误信息:**
校验失败时，`decodeUnknownSync` 抛出包含字段路径和具体原因的 `ParseError`，便于定位问题。

### 4.2 `02-class-and-tag.ts` — Schema.Class 与 Schema.Tag

**运行:** `bun run src/02-class-and-tag.ts`

这个文件演示了 `Schema.Class` 类风格定义和 Tag 模式，是构建领域模型的核心技能。

**代码结构解析:**

**第 19-48 行 — Schema.Class 基本用法:**
```typescript
class User extends Schema.Class<User>("User")({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  email: Schema.String,
}) {
  get displayName(): string { return `${this.name} (${this.age}岁)` }
  get isAdult(): boolean { return this.age >= 18 }
  static from(input: unknown): User { return Schema.decodeUnknownSync(User)(input) }
}
```
`Schema.Class` 将字段定义、构造函数、运行时校验绑定在一起。类体中可以定义 getter（计算属性）和静态工厂方法。`new User({...})` 会自动校验数据。

**第 53-101 行 — 带 _tag 的错误类:**
```typescript
class ValidationError extends Schema.Class<ValidationError>("ValidationError")({
  _tag: Schema.Literal("ValidationError"),
  message: Schema.String,
  field: Schema.optional(Schema.String),
}) {
  get description(): string { return `[${this._tag}] ${this.message}` }
  static forField(field: string, message: string): ValidationError {
    return new ValidationError({ _tag: "ValidationError", message, field })
  }
}
```
通过 `Schema.Class` + 显式 `_tag` 字段实现 tagged error 模式。`_tag` 固定为类名字符串，用于后续的错误类型匹配。这与 OpenCode 中 `Usage` 类的模式一致。

**第 126-171 行 — Schema.TaggedStruct 与可区分联合:**
```typescript
const OrderCreated = Schema.TaggedStruct("OrderCreated", {
  orderId: Schema.String,
  amount: Schema.Number,
})

const OrderEvent = Schema.Union([OrderCreated, OrderCancelled])
  .pipe(Schema.toTaggedUnion("_tag"))
```
`Schema.TaggedStruct(tagString, fields)` 创建带固定 `_tag` 的结构体。多个 TaggedStruct 通过 `Schema.Union([...])` + `toTaggedUnion("_tag")` 组合为可区分联合，运行时根据 `_tag` 值自动识别具体类型。

**第 175-204 行 — Schema.Class vs 普通 class 对比:**
展示了 Schema.Class 的运行时校验能力与普通 TypeScript class 的差异。普通 class 不提供任何运行时校验，负价格可以悄无声息地通过。

**第 208-244 行 — OpenCode 模式参考:**
以 `TokenUsage` 为例展示了 OpenCode 中 `Usage` 类的核心模式：`Schema.Class` 定义字段 + getter 计算属性 + 静态工厂方法。

### 4.3 `03-encode-decode.ts` — 序列化与反序列化

**运行:** `bun run src/03-encode-decode.ts`

这个文件演示了 Schema 的双向编解码能力和 JSON 往返流程。

**代码结构解析:**

**第 22-39 行 — 基础编解码:**
```typescript
const user = Schema.decodeUnknownSync(UserSchema)(data)
const encoded = Schema.encodeUnknownSync(UserSchema)(user)
```
`decodeUnknownSync` 从 `unknown` 解码为类型安全对象，`encodeUnknownSync` 从类型安全对象编码回原始格式。对于简单 Schema，往返一致。

**第 44-70 行 — Effect 原生集成:**
```typescript
const decodeProgram = pipe(
  Schema.decodeUnknownEffect(UserSchema)(data),
  Effect.map((u) => `用户: ${u.name}`),
)
const result = Effect.runSync(decodeProgram)
```
`decodeUnknownEffect` 和 `encodeUnknownEffect` 直接返回 Effect，无需 `Effect.tryPromise` 包装。这是与 Effect 生态系统集成最自然的方式。

**第 75-103 行 — JSON 序列化往返:**
完整演示了 JSON 字符串 → `JSON.parse` → `decodeUnknownEffect` → 类型安全操作（`toUpperCase`、`+1`）→ `encodeUnknownEffect` → `JSON.stringify` 的完整往返流程。

**第 108-129 行 — 不抛异常的校验:**
```typescript
const result = Schema.decodeUnknownOption(UserSchema)(data)
if (Option.isSome(result)) { ... }
if (Option.isNone(result)) { ... }
```
`decodeUnknownOption` 返回 `Option<A>`，合法数据得到 `Some(value)`，非法数据得到 `None`。适用于不想用 try/catch 处理校验失败的场景。

**第 133-157 行 — 自定义数据清洗:**
演示了在 Schema 校验之前先用自定义函数清洗数据（trim、toLowerCase）的模式。这是处理外部脏数据的常见做法。

### 4.4 `04-type-inference.ts` — Schema 与 TypeScript 类型双向推导

**运行:** `bun run src/04-type-inference.ts`

这个文件演示了 Schema 作为"类型定义 + 运行时校验"统一入口的完整能力。

**代码结构解析:**

**第 17-49 行 — typeof schema.Type:**
```typescript
const UserSchema = Schema.Struct({ ... })
type User = typeof UserSchema.Type
```
从 Schema 自动推导 TypeScript 类型。类型包含所有字段、约束（如 `role: "admin" | "user" | "moderator"`）、以及 `readonly` 修饰符。编译器会检查所有对该类型的使用。

**第 54-90 行 — typeof schema.Encoded:**
```typescript
const ProductSchema = Schema.Struct({
  price: Schema.NumberFromString,  // Encoded: string, Type: number
})
type Product = typeof ProductSchema.Type        // { price: number }
type ProductEncoded = typeof ProductSchema.Encoded  // { price: string }
```
当 Schema 包含 `NumberFromString` 等变换时，`.Type`（解码后）和 `.Encoded`（编码前）是不同的类型。这是理解 Schema 双向能力的关键。

**第 95-131 行 — Standard Schema V1 兼容:**
```typescript
const standardSchema = Schema.toStandardSchemaV1(UserSchema)
const { version, vendor, validate } = standardSchema["~standard"]
```
Effect Schema 通过 `toStandardSchemaV1` 支持 Standard Schema 规范，可以与 Zod、Valibot 等库互操作。标准接口通过 `"~standard"` 属性访问。

**第 135-197 行 — Schema 作为"单一真相源":**
以 `OrderSchema` 为例展示了"一处定义、多处使用"的模式：
- TypeScript 类型（编译时检查）
- 运行时校验（`decodeUnknownSync`）
- 序列化（`encodeUnknownSync` + `JSON.stringify`）
- 数据清洗

这彻底消除了传统方式中"interface 定义"和"validate 函数"可能不同步的问题。

**第 201-229 行 — 类型推导边界案例:**
展示了 `Schema.optional` 在类型推导中的表现，以及深层嵌套结构的自动类型推导能力。

## 5. OpenCode 实战引用

OpenCode 项目中，Schema 是最核心的基础设施之一。`packages/llm/src/schema/events.ts` 展示了 Schema 在生产环境中的完整用法。

### 5.1 Usage 类 — Schema.Class 生产级模式

```typescript
class Usage extends Schema.Class<Usage>("LLM.Usage")({
  inputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number),
  nonCachedInputTokens: Schema.optional(Schema.Number),
  cacheReadInputTokens: Schema.optional(Schema.Number),
  cacheWriteInputTokens: Schema.optional(Schema.Number),
  reasoningTokens: Schema.optional(Schema.Number),
  totalTokens: Schema.optional(Schema.Number),
  providerMetadata: Schema.optional(ProviderMetadata),
}) {
  get visibleOutputTokens() {
    return Math.max(0, (this.outputTokens ?? 0) - (this.reasoningTokens ?? 0))
  }

  static from(input: UsageInput) {
    return input instanceof Usage ? input : new Usage(input)
  }
}
```

这个类展示了 `Schema.Class` 的三个核心模式：

1. **可选字段用 `Schema.optional`:** 不是所有 LLM 提供商都返回所有字段，`optional` 提供了灵活性
2. **getter 提供计算属性:** `visibleOutputTokens` 是一个计算值，不需要存储
3. **静态工厂 `from`:** 提供便捷构造，自动处理"已经是实例"和"需要创建实例"两种情况

### 5.2 LLMEvent — 可区分联合的生产级应用

OpenCode 定义了 16 种 LLM 事件类型（`TextStart`、`TextDelta`、`ToolCall`、`StepFinish` 等），每种都是一个 TaggedStruct：

```typescript
export const TextDelta = Schema.Struct({
  type: Schema.tag("text-delta"),
  id: ContentBlockID,
  text: Schema.String,
}).annotate({ identifier: "LLM.Event.TextDelta" })

// 16 种事件通过 toTaggedUnion 组合为一个联合类型
const llmEventTagged = Schema.Union([StepStart, TextStart, TextDelta, ...])
  .pipe(Schema.toTaggedUnion("type"))

export type LLMEvent = Schema.Schema.Type<typeof llmEventTagged>
```

这展示了 Schema 在实际项目中的两个关键实践：
- 用 `Schema.tag("tag-name")` 为每个事件类型标注唯一的 tag
- 用 `toTaggedUnion` 将多个 TaggedStruct 组合为一个可区分的联合类型
- 用 `Schema.Schema.Type<typeof schema>` 从联合 Schema 推导完整的 TypeScript 类型

## 6. 常见陷阱

### 陷阱 1: 混淆 .Type 和 .Encoded

```typescript
const Schema = Schema.Struct({
  price: Schema.NumberFromString,
})

// 错误: 把 Encoded 类型当作内部类型使用
function calculateTotal(price: typeof Schema.Encoded["price"]) {
  return price * 1.1  // 编译错误！price 是 string，不能做乘法
}

// 正确: 使用 .Type 作为内部类型
function calculateTotal(price: typeof Schema.Type["price"]) {
  return price * 1.1  // price 是 number，正确
}
```

**规则:** `.Type` 用于应用内部逻辑，`.Encoded` 用于网络传输和序列化。定义 API 类型时使用 `.Encoded`，编写业务逻辑时使用 `.Type`。

### 陷阱 2: 忘记 Schema 校验是运行时操作

```typescript
// 错误: 认为 Schema 类型已经提供了安全保障
const data: unknown = JSON.parse(userInput)
const user: User = data as User  // 类型断言，零运行时保障！

// 正确: 必须调用 decode 进行运行时校验
const data: unknown = JSON.parse(userInput)
const user = Schema.decodeUnknownSync(UserSchema)(data)
// 如果 data 不符合 Schema，这里会抛出错误
```

**规则:** TypeScript 类型在编译后消失，`as` 断言不产生任何运行时代码。Schema 的类型推导（`typeof schema.Type`）只提供编译时检查，运行时安全必须通过 `decodeUnknownSync` 等校验 API 获得。

### 陷阱 3: 在 Effect.gen 中直接使用 decodeUnknownSync

```typescript
// 不推荐: 在 Effect 管道中混用同步 API
const program = Effect.gen(function* () {
  const data = Schema.decodeUnknownSync(Schema)(raw)  // 可能抛异常！
  return processData(data)
})

// 推荐: 使用 Effect 原生 API
const program = Effect.gen(function* () {
  const data = yield* Schema.decodeUnknownEffect(Schema)(raw)
  // 错误会通过 Effect 的错误通道传播，类型安全
  return processData(data)
})
```

**规则:** 在 `Effect.gen` 或 Effect 管道中，始终使用 `decodeUnknownEffect` / `encodeUnknownEffect` 而非同步版本。这样错误会通过 Effect 的错误通道传播，保持类型安全。

### 陷阱 4: 混淆 Schema.decode 和 Schema.decodeUnknown

```typescript
// Schema.decode 和 Schema.encode 需要 Schema 包含 transform
// 对于普通 Struct，它们会运行时失败

// 正确: 对普通 Struct 使用 decodeUnknown* / encodeUnknown* 系列
Schema.decodeUnknownSync(UserSchema)(data)      // OK
Schema.decodeUnknownEffect(UserSchema)(data)    // OK
Schema.encodeUnknownSync(UserSchema)(data)      // OK
```

**规则:** `decode` / `encode` 系列 API（不带 `Unknown`）需要 Schema 有明确的编码/解码变换。对普通 Struct 使用 `decodeUnknown*` / `encodeUnknown*` 系列 API。

## 7. 本章小结

本章建立了 Effect-TS Schema 系统的完整基础：

- **Schema 是"类型定义的运行时延续"** — TypeScript 类型在编译后消失，Schema 提供了运行时的类型安全保障
- **`Schema.Struct` 是核心构造器** — 定义结构化数据，同时获得 TypeScript 类型和运行时校验
- **`Schema.check` + `Schema.is*` 实现字段级约束** — 正数、整数、字符串长度、正则匹配等
- **`Schema.Class` 是面向对象风格的 Schema** — 将字段定义、构造函数、实例方法绑定在一起，一个类即一个完整的领域模型
- **`Schema.TaggedStruct` + `toTaggedUnion` 构建可区分联合** — OpenCode 用这个模式管理 16 种 LLM 事件类型
- **编解码 API 覆盖所有场景** — 同步（`Sync`）、Effect 原生（`Effect`）、不抛异常（`Option`）、Promise 互操作（`Promise`）
- **Schema 作为"单一真相源"** — 一处定义，同时获得类型推导、运行时校验、序列化/反序列化

掌握 Schema 后，你已经能够为任何外部数据建立类型安全的"防火墙"。从下一章开始，我们将引入 Context（依赖注入）和 Layer（依赖组装），构建完整的 Effect-TS 应用架构。

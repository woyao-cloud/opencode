# 第 9 章: Schema 进阶 — 复杂数据建模

## 1. 本章目标

完成本章学习后，你将能够：

- 使用 `Schema.Union` / `Schema.Literal` / `Schema.Literals` 构建联合类型和字面量类型
- 使用 `Schema.TemplateLiteral` 定义模板字面量模式
- 使用 `SchemaTransformation.transform` 创建自定义双向变换（string ↔ number、string ↔ Date 等）
- 使用 `SchemaTransformation.transformOrFail` 创建可失败的变换
- 使用 `S.suspend` 构建递归 Schema（树形结构、嵌套数据）
- 通过 Struct 组合实现 Schema 的扩展（extend）、裁剪（omit/pick）、部分类型（partial）
- 使用 Schema 构建完整的 API 类型系统（请求、响应、事件、错误）
- 理解 Schema 作为"单一真相源"在 API 设计中的实践

## 2. 前置知识

阅读本章前，你需要掌握：

- **第 3 章内容:** Schema.Struct、Schema.Class、Schema.TaggedStruct、编解码 API（decodeUnknownSync / encodeSync）、.Type 与 .Encoded 的区别
- **Effect 基础:** `Effect<R, E, A>` 类型模型、`Effect.succeed` / `Effect.fail`
- **TypeScript 进阶类型:** 联合类型、字面量类型、递归类型、模板字面量类型

## 3. 概念讲解

### 3.1 Schema 是"可组合的类型系统"

第 3 章介绍了 Schema 作为"类型定义的运行时延续"——它将 TypeScript 编译时类型延伸到运行时。本章在此基础上，将 Schema 视为一个**可组合的类型系统**（Composable Type System）。

这意味着 Schema 不仅仅是校验器，更是一个完整的类型编程工具：

1. **组合（Compose）:** 小 Schema 组合成大 Schema（Union、Struct、TemplateLiteral）
2. **变换（Transform）:** 一种类型 ↔ 另一种类型（string ↔ number、snake_case ↔ camelCase）
3. **递归（Recursion）:** Schema 引用自身（树、链表、嵌套结构）
4. **裁剪（Pick/Omit）:** 从已有 Schema 中选取或排除字段
5. **扩展（Extend）:** 在已有 Schema 基础上添加字段

这些能力让 Schema 成为 API 类型系统的理想基础——一处定义 Schema，同时获得类型推导、运行时校验、序列化/反序列化。

### 3.2 Union / Literal / TemplateLiteral

#### Schema.Literal 与 Schema.Literals

`Schema.Literal` 定义单个字面量值，`Schema.Literals` 定义多个字面量值的联合：

```typescript
// 单个字面量
const StatusActive = Schema.Literal("active")
// type: "active"

// 多个字面量 (数组形式)
const StatusSchema = Schema.Literals(["active", "inactive", "suspended"])
// type: "active" | "inactive" | "suspended"
```

**注意:** beta.65 中 `Schema.Literal` 只接受单个值，多值使用 `Schema.Literals`（数组形式）。

#### Schema.Union

`Schema.Union` 将多个 Schema 组合为联合类型：

```typescript
const StringOrNumber = Schema.Union([Schema.String, Schema.Number])
// type: string | number
```

Union 接受 Schema 数组，运行时按顺序尝试匹配。

#### Schema.TemplateLiteral

`Schema.TemplateLiteral` 定义模板字面量模式，类似于 TypeScript 的模板字面量类型：

```typescript
const Greeting = Schema.TemplateLiteral([
  Schema.Literal("Hello, "),
  Schema.String,
  Schema.Literal("!"),
])
// 匹配: "Hello, World!"、"Hello, Alice!" 等
// 不匹配: "Hi, World!"
```

TemplateLiteral 在 beta.65 中接受数组参数，每个元素可以是 `Schema.Literal` 或 `Schema.String`。

#### 可区分联合（Discriminated Union）

可区分联合是 Schema 中最常用的模式之一。通过 `Schema.TaggedStruct` 创建带 `_tag` 字段的结构体，再用 `Schema.Union` + `Schema.toTaggedUnion` 组合：

```typescript
const Dog = Schema.TaggedStruct("Dog", {
  name: Schema.String,
  breed: Schema.String,
})

const Cat = Schema.TaggedStruct("Cat", {
  name: Schema.String,
  likesMice: Schema.Boolean,
})

const Animal = Schema.Union([Dog, Cat]).pipe(
  Schema.toTaggedUnion("_tag")
)
// 运行时根据 _tag 自动识别具体类型
```

### 3.3 Transform — Schema 变换

变换（Transform）是 Schema 最强大的特性之一。它允许你在"外部格式"和"内部格式"之间建立双向映射。

#### 变换模型

每个变换定义两个方向：

- **解码（Decode）:** 外部格式 → 内部格式（`unknown` → 类型安全值）
- **编码（Encode）:** 内部格式 → 外部格式（类型安全值 → 传输格式）

```
外部格式 (Encoded)  ←→  内部格式 (Type)
     string                  number
     "2024-01-15"            Date
     snake_case              camelCase
```

#### 创建变换

在 beta.65 中，使用 `SchemaTransformation.transform` 创建变换，再通过 `S.decodeTo` 应用到 Schema：

```typescript
import { SchemaTransformation } from "effect"
import * as S from "effect/Schema"

// 1. 创建变换
const StringToNumberTrans = SchemaTransformation.transform({
  decode: (s: string) => parseInt(s, 10),
  encode: (n: number) => n.toString(),
})

// 2. 应用到 Schema
const StringToNumber = Schema.String.pipe(
  S.decodeTo(Schema.Number, StringToNumberTrans)
)

// 3. 使用
const n = Schema.decodeUnknownSync(StringToNumber)("42")  // → 42 (number)
const s = Schema.encodeSync(StringToNumber)(42)            // → "42" (string)
```

#### transformOrFail — 可失败的变换

当变换可能失败时（如解析可能非法的输入），使用 `transformOrFail`。其 decode/encode 返回 `Effect`：

```typescript
const SafeParseIntTrans = SchemaTransformation.transformOrFail({
  decode: (s: string) => {
    const n = parseInt(s, 10)
    if (isNaN(n)) return Effect.fail(`无法解析 "${s}"`)
    return Effect.succeed(n)
  },
  encode: (n: number) => Effect.succeed(n.toString()),
})
```

#### 内建变换 Schema

beta.65 提供了一些内建变换 Schema，可直接使用：

| Schema | 外部类型 | 内部类型 |
|--------|---------|---------|
| `Schema.NumberFromString` | `string` | `number` |
| `Schema.DateFromString` | `string` | `Date` |
| `Schema.BigIntFromString` | `string` | `bigint` |
| `Schema.JSONFromString` | `string` | `JSON` |

### 3.4 Extend / Omit / Pick / Partial

beta.65 不提供 `Schema.extend`、`Schema.omit`、`Schema.pick`、`Schema.partial` 等内置 API。这些操作通过手动 Struct 组合实现。

#### Extend — 扩展字段

通过 `Struct.fields` 获取已有字段，再合并新字段：

```typescript
const BaseUser = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

const ExtendedUser = Schema.Struct({
  ...BaseUser.fields,  // 展开已有字段
  email: Schema.String,  // 添加新字段
  phone: Schema.optional(Schema.String),
})
```

#### Omit — 省略字段

通过解构排除不需要的字段：

```typescript
const { password: _, createdAt: __, ...restFields } = FullUser.fields
const PublicUser = Schema.Struct(restFields)
```

#### Pick — 选取字段

直接选取需要的字段：

```typescript
const UserPreview = Schema.Struct({
  name: FullUser.fields.name,
  email: FullUser.fields.email,
})
```

#### Partial — 全部可选

使用 `Schema.optional` 包装每个字段：

```typescript
const PartialUser = Schema.Struct({
  name: Schema.optional(Schema.String),
  age: Schema.optional(Schema.Number),
})
```

### 3.5 递归 Schema

递归 Schema 用于定义自引用的数据结构，如树、链表、嵌套注释等。

#### S.suspend — 延迟引用

在 beta.65 中，使用 `S.suspend(() => schema)` 实现递归引用：

```typescript
interface TreeNode {
  value: number
  children: TreeNode[]
}

const TreeNodeSchema: S.Schema<TreeNode> = S.Struct({
  value: S.Number,
  children: S.Array(S.suspend(() => TreeNodeSchema)),
})
```

`suspend` 接受一个工厂函数 `() => schema`，在 Schema 被实际使用时才解析引用，避免了循环引用问题。

#### 递归的深度限制

递归 Schema 没有内置的深度限制，但实际使用中应注意：

- 过深的递归可能导致栈溢出
- 可以在应用层添加深度检查
- 对于深度不确定的数据，考虑使用扁平化结构

#### 递归与变换结合

递归 Schema 也可以包含变换字段：

```typescript
const TransNodeSchema: S.Schema<TransNode> = S.Struct({
  value: S.String.pipe(S.decodeTo(S.Number, ValueTrans)),
  children: S.Array(S.suspend(() => TransNodeSchema)),
})
```

### 3.6 API 类型系统

Schema 最强大的应用场景之一是构建完整的 API 类型系统。通过 Schema，可以在一个地方定义 API 的请求、响应、事件和错误类型，同时获得类型推导和运行时校验。

#### 请求 Schema

```typescript
const CreateUserRequest = Schema.Struct({
  name: Schema.String.pipe(
    Schema.check(Schema.isMinLength(2)),
    Schema.check(Schema.isMaxLength(50))
  ),
  email: Schema.String,
  age: Schema.optional(Schema.Number),
})
```

#### 响应 Schema

```typescript
const ApiResponse = Schema.Struct({
  success: Schema.Boolean,
  message: Schema.String,
  data: Schema.optional(Schema.Unknown),
})
```

#### 事件 Schema（可区分联合）

参考 OpenCode LLM 事件系统的设计模式，使用 `type` 字段做区分：

```typescript
const StepStart = Schema.Struct({
  type: Schema.Literal("step-start"),
  stepId: Schema.String,
  timestamp: Schema.Number,
})

const TextDelta = Schema.Struct({
  type: Schema.Literal("text-delta"),
  id: Schema.String,
  text: Schema.String,
})

const LLMEvent = Schema.Union([StepStart, TextDelta, ...])
  .pipe(Schema.toTaggedUnion("type"))
```

#### 错误 Schema

```typescript
const ValidationError = Schema.Struct({
  _tag: Schema.Literal("ValidationError"),
  field: Schema.String,
  message: Schema.String,
})

const ApiError = Schema.Union([ValidationError, NotFoundError, ...])
  .pipe(Schema.toTaggedUnion("_tag"))
```

## 4. 代码示例

本章配套 5 个可独立运行的示例文件，位于 `demos/ch09-schema-advanced/src/` 目录下。建议按顺序阅读和运行。

**运行环境准备:**

```bash
cd demos/ch09-schema-advanced
bun install
```

### 4.1 `01-union-literal.ts` — Union / Literal / TemplateLiteral

**运行:** `bun run src/01-union-literal.ts`

这个文件演示了联合类型、字面量类型和模板字面量类型的进阶用法。

**代码结构解析:**

**第 17-30 行 — Schema.Literals 多值字面量:**
```typescript
const ColorSchema = Schema.Literals(["red", "green", "blue"])
```
`Schema.Literals` 接受字符串数组，创建字面量联合类型。`"yellow"` 不在列表中，运行时被拒绝。

**第 35-48 行 — Schema.Union 联合类型:**
```typescript
const StringOrNumber = Schema.Union([Schema.String, Schema.Number])
```
`Schema.Union` 接受 Schema 数组，运行时按顺序尝试匹配。`true`（boolean）不在联合中，被拒绝。

**第 54-80 行 — 可区分联合:**
```typescript
const Dog = Schema.TaggedStruct("Dog", { name: Schema.String, breed: Schema.String })
const Animal = Schema.Union([Dog, Cat]).pipe(Schema.toTaggedUnion("_tag"))
```
`TaggedStruct` 自动添加 `_tag` 字段。`toTaggedUnion` 根据 `_tag` 值自动识别具体类型。

**第 86-113 行 — Schema.TemplateLiteral:**
```typescript
const Greeting = Schema.TemplateLiteral([
  Schema.Literal("Hello, "),
  Schema.String,
  Schema.Literal("!"),
])
```
TemplateLiteral 在 beta.65 中接受数组参数。生成的正则模式 `^(Hello, )([\s\S]*?)(!)$` 用于运行时匹配。

**第 119-140 行 — Struct.fields 提取字段名:**
```typescript
const fieldNames = Object.keys(UserSchema.fields)
const UserField = Schema.Literals(fieldNames as [string, ...string[]])
```
`Struct.fields` 包含所有字段的 Schema，`Object.keys` 提取字段名，可用于构建字段名字面量联合。

**第 146-175 行 — 复杂可区分联合:**
展示了带多字段 tag 的可区分联合，`code` 字段也使用字面量类型（`200`、`404`）。

### 4.2 `02-transform.ts` — Schema 变换

**运行:** `bun run src/02-transform.ts`

这个文件演示了如何使用 `SchemaTransformation.transform` 和 `transformOrFail` 创建自定义变换。

**代码结构解析:**

**第 17-44 行 — 基础变换 string ↔ number:**
```typescript
const StringToNumberTrans = SchemaTransformation.transform({
  decode: (s: string) => parseInt(s, 10),
  encode: (n: number) => n.toString(),
})
const StringToNumber = Schema.String.pipe(
  S.decodeTo(Schema.Number, StringToNumberTrans)
)
```
`SchemaTransformation.transform` 创建变换对象，`S.decodeTo` 将变换应用到 Schema。`decode` 定义外部→内部，`encode` 定义内部→外部。类型推导自动反映变换：`.Type` 是 `number`，`.Encoded` 是 `string`。

**第 50-66 行 — string ↔ Date 变换:**
```typescript
const DateFromStringTrans = SchemaTransformation.transform({
  decode: (s: string) => new Date(s),
  encode: (d: Date) => d.toISOString(),
})
```
实际场景：API 返回 ISO 字符串，内部使用 `Date` 对象。

**第 72-99 行 — transformOrFail 可失败变换:**
```typescript
const SafeParseIntTrans = SchemaTransformation.transformOrFail({
  decode: (s: string) => {
    const n = parseInt(s, 10)
    if (isNaN(n)) return Effect.fail(`无法解析 "${s}"`)
    return Effect.succeed(n)
  },
  encode: (n: number) => Effect.succeed(n.toString()),
})
```
`transformOrFail` 的 decode/encode 返回 `Effect`。失败时通过 Effect 错误通道传播。

**第 105-143 行 — snake_case ↔ camelCase 字段变换:**
展示了如何通过 `SchemaTransformation.transform` 实现字段名变换。定义两个 Struct（snake_case 外部、camelCase 内部），在 decode/encode 函数中手动映射字段名。

**第 149-175 行 — 内建变换 Schema:**
```typescript
const ProductSchema = Schema.Struct({
  price: Schema.NumberFromString,  // 外部 string, 内部 number
})
```
`NumberFromString` 是内建变换 Schema，在 Struct 中直接使用。解码后 `price` 是 `number`，编码后变回 `string`。

### 4.3 `03-extend-omit.ts` — Schema 扩展与裁剪

**运行:** `bun run src/03-extend-omit.ts`

这个文件演示了如何通过 Struct 组合实现 Schema 的扩展、裁剪、部分类型等操作。

**代码结构解析:**

**第 17-33 行 — Schema.extend 扩展字段:**
```typescript
const ExtendedUser = Schema.Struct({
  ...BaseUser.fields,  // 展开已有字段
  email: Schema.String,
  phone: Schema.optional(Schema.String),
})
```
通过 `Struct.fields` 获取已有字段，再合并新字段。这是最灵活的扩展方式。

**第 39-62 行 — Schema.omit 省略字段:**
```typescript
const { password: _, createdAt: __, ...restFields } = FullUser.fields
const PublicUser = Schema.Struct(restFields)
```
通过解构排除不需要的字段。注意 Struct 默认会忽略多余字段（不报错）。

**第 68-80 行 — Schema.pick 选取字段:**
```typescript
const UserPreview = Schema.Struct({
  name: FullUser.fields.name,
  email: FullUser.fields.email,
})
```
直接从原 Schema 的 `fields` 中选取需要的字段。

**第 86-105 行 — Schema.partial 全部可选:**
```typescript
const PartialUser = Schema.Struct({
  name: Schema.optional(Schema.String),
  age: Schema.optional(Schema.Number),
})
```
使用 `Schema.optional` 包装每个字段。空对象 `{}` 可以通过校验。

**第 111-125 行 — Schema.required 全部必填:**
从可选字段 Schema 创建必填版本，只需重新定义不带 `optional` 的 Struct。

**第 131-155 行 — 多层扩展:**
展示了如何组合多个 Schema 的字段构建完整类型。`CompleteUser` 由 `BaseUser`、`Contact`、`Address` 三个 Schema 的字段组合而成。

**第 161-178 行 — extendTo 实验性 API:**
beta.65 提供了 `S.extendTo` 作为扩展的实验性 API，但需要 `derive` 参数（用于从旧字段推导新字段的默认值），使用较为复杂。

### 4.4 `04-recursive.ts` — 递归 Schema

**运行:** `bun run src/04-recursive.ts`

这个文件演示了如何使用 `S.suspend` 构建递归 Schema。

**代码结构解析:**

**第 17-35 行 — 树形结构递归:**
```typescript
interface TreeNode {
  value: number
  label: string
  children: TreeNode[]
}

const TreeNodeSchema: S.Schema<TreeNode> = S.Struct({
  value: S.Number,
  label: S.String,
  children: S.Array(S.suspend(() => TreeNodeSchema)),
})
```
`suspend(() => TreeNodeSchema)` 延迟引用自身。`TreeNodeSchema` 在定义时尚未完成，通过工厂函数在运行时才解析引用。

**第 37-60 行 — 树形数据解码:**
创建一个三层树（根节点 → 子节点 → 叶子节点），验证递归解码和编码的正确性。

**第 66-78 行 — 递归深度限制:**
递归 Schema 没有内置深度限制，浅树（深度 1）也能正常解码。

**第 84-95 行 — 递归 JSON 数据:**
模拟从 JSON.parse 解析的树形数据，验证递归 Schema 与 JSON 序列化的兼容性。

**第 101-120 行 — 带元数据的树:**
更复杂的递归 Schema，每个节点包含 `id`、`data`（Record）和 `children`。

**第 126-152 行 — 递归与变换结合:**
```typescript
const TransNodeSchema: S.Schema<TransNode> = S.Struct({
  value: S.String.pipe(S.decodeTo(S.Number, ValueTrans)),
  children: S.Array(S.suspend(() => TransNodeSchema)),
})
```
递归 Schema 的字段也可以包含变换。`value` 在外部是 `string`，内部是 `number`。

**第 158-178 行 — 可选子节点的递归:**
```typescript
children: S.optional(S.Array(S.suspend(() => OptionalNodeSchema)))
```
子节点可以是可选的，叶子节点不需要提供 `children` 字段。

### 4.5 `05-api-types.ts` — API 类型系统

**运行:** `bun run src/05-api-types.ts`

这个文件演示了如何使用 Schema 构建完整的 API 类型系统，参考 OpenCode LLM 事件系统的设计模式。

**代码结构解析:**

**第 17-35 行 — 请求 Schema:**
```typescript
const CreateUserRequest = Schema.Struct({
  name: Schema.String.pipe(
    Schema.check(Schema.isMinLength(2)),
    Schema.check(Schema.isMaxLength(50))
  ),
  email: Schema.String,
  age: Schema.optional(Schema.Number),
})
```
请求 Schema 包含字段级约束（`isMinLength`、`isMaxLength`）和可选字段。

**第 41-60 行 — 响应 Schema:**
```typescript
const ApiResponse = Schema.Struct({
  success: Schema.Boolean,
  message: Schema.String,
  data: Schema.optional(Schema.Unknown),
})
```
通用 API 响应格式，`data` 字段使用 `Schema.Unknown` 接受任意类型。

**第 66-125 行 — 事件 Schema（可区分联合）:**
参考 OpenCode 的 LLM 事件系统，定义了 4 种事件类型（`StepStart`、`TextDelta`、`ToolCall`、`StepFinish`），每种使用 `type` 字段做区分。通过 `Schema.Union` + `toTaggedUnion("type")` 组合为可区分联合。

**第 131-160 行 — 错误 Schema:**
定义了 3 种 API 错误类型（`ValidationError`、`NotFoundError`、`InternalError`），使用 `_tag` 字段做区分。这是 Effect-TS 推荐的错误处理模式。

**第 166-195 行 — Schema 作为"单一真相源":**
```typescript
const OrderSchema = Schema.Struct({
  orderId: Schema.String,
  product: Schema.String,
  quantity: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  price: Schema.NumberFromString,
})
```
一处定义 Schema，同时获得 TypeScript 类型（`typeof OrderSchema.Type`）、运行时校验（`decodeUnknownSync`）、序列化（`encodeSync`）。

**第 201-230 行 — 完整 API 流程:**
模拟了一个完整的 API 请求-响应-错误处理流程：校验请求 → 处理业务逻辑 → 构建响应。非法请求在第一步就被 Schema 校验拦截。

## 5. OpenCode 实战引用

OpenCode 项目中大量使用了 Schema 进阶特性，特别是在 LLM 事件系统和 API 类型定义中。

### 5.1 LLM 事件系统 — 可区分联合

OpenCode 的 `packages/llm/src/schema/events.ts` 定义了 16 种 LLM 事件类型，每种都是一个带 `type` 字段的 Struct：

```typescript
// 简化的 OpenCode 事件模式
const TextDelta = Schema.Struct({
  type: Schema.Literal("text-delta"),
  id: ContentBlockID,
  text: Schema.String,
})

// 16 种事件通过 toTaggedUnion 组合
const llmEventTagged = Schema.Union([
  StepStart, TextStart, TextDelta, ToolCall,
  StepFinish, ...
]).pipe(Schema.toTaggedUnion("type"))
```

这个模式的关键点：
1. 每个事件使用 `Schema.Literal` 定义唯一的 `type` 值
2. 使用 `Schema.Struct`（而非 `TaggedStruct`）避免自动添加 `_tag` 字段
3. 通过 `toTaggedUnion("type")` 组合为可区分联合
4. 运行时根据 `type` 值自动识别具体事件类型

### 5.2 Schema 作为 API 的"单一真相源"

OpenCode 中，Schema 不仅是数据校验工具，更是 API 契约的定义中心：

- **请求 Schema:** 定义 API 接受的输入格式和约束
- **响应 Schema:** 定义 API 返回的数据格式
- **事件 Schema:** 定义流式响应中的事件类型
- **错误 Schema:** 定义 API 可能返回的错误类型

这种设计模式的优势：
1. **一处定义，多处使用:** 类型推导、运行时校验、序列化共享同一份定义
2. **类型安全:** 编译时和运行时双重保障
3. **文档即代码:** Schema 定义本身就是 API 文档
4. **易于维护:** 修改 Schema 自动同步到所有使用处

### 5.3 变换在 API 边界中的应用

OpenCode 在 API 边界处大量使用 Schema 变换：

- **字段名变换:** API 返回 snake_case，内部使用 camelCase
- **类型变换:** API 返回 string 格式的数字/日期，内部使用 number/Date
- **可选字段处理:** API 可能不返回某些字段，内部使用 `Option` 或 `undefined`

## 6. 常见陷阱

### 陷阱 1: 忘记 S.suspend 导致循环引用

```typescript
// 错误: 直接引用自身，导致循环引用
const TreeNodeSchema = S.Struct({
  value: S.Number,
  children: S.Array(TreeNodeSchema)  // ❌ 循环引用！
})

// 正确: 使用 S.suspend 延迟引用
const TreeNodeSchema: S.Schema<TreeNode> = S.Struct({
  value: S.Number,
  children: S.Array(S.suspend(() => TreeNodeSchema))  // ✅
})
```

**规则:** 任何自引用的 Schema 都必须使用 `S.suspend(() => schema)` 包装。TypeScript 类型声明（`interface`）也需要提前定义。

### 陷阱 2: 混淆 transform 的 decode/encode 方向

```typescript
// 错误: 方向搞反了
const BadTrans = SchemaTransformation.transform({
  decode: (n: number) => n.toString(),  // ❌ decode 应该是 string → number
  encode: (s: string) => parseInt(s, 10),  // ❌ encode 应该是 number → string
})

// 正确
const GoodTrans = SchemaTransformation.transform({
  decode: (s: string) => parseInt(s, 10),  // ✅ 外部 string → 内部 number
  encode: (n: number) => n.toString(),     // ✅ 内部 number → 外部 string
})
```

**规则:** `decode` = 外部 → 内部（"解码"外部数据为内部类型），`encode` = 内部 → 外部（"编码"内部数据为传输格式）。

### 陷阱 3: 在 beta.65 中使用不存在的 API

```typescript
// 错误: beta.65 中不存在这些 API
Schema.transform(from, to, { decode, encode })  // ❌
Schema.extend(base, fields)                      // ❌
Schema.omit(schema, keys)                         // ❌
Schema.Lazy(() => schema)                        // ❌
Schema.keyof(schema)                              // ❌

// 正确: beta.65 中的替代 API
SchemaTransformation.transform({ decode, encode })  // ✅
Schema.Struct({ ...base.fields, ...newFields })     // ✅ (手动 extend)
S.suspend(() => schema)                             // ✅
```

**规则:** 使用前先验证 API 是否可用。beta.65 的 API 与最新版 Effect 有所不同。本章所有 API 都经过实际验证。

### 陷阱 4: 混淆 Schema.Literal 和 Schema.Literals

```typescript
// 错误: Literal 不接受多个参数
Schema.Literal("a", "b", "c")  // ❌ beta.65 中只接受单个值

// 正确
Schema.Literal("a")              // ✅ 单个字面量
Schema.Literals(["a", "b", "c"]) // ✅ 多个字面量 (数组形式)
```

**规则:** `Schema.Literal` 只接受单个值，多值使用 `Schema.Literals`（数组形式）。

### 陷阱 5: 递归 Schema 的类型标注

```typescript
// 错误: 没有标注类型，TypeScript 无法推断递归类型
const TreeNodeSchema = S.Struct({  // ❌ 隐式 any
  value: S.Number,
  children: S.Array(S.suspend(() => TreeNodeSchema)),
})

// 正确: 显式标注类型
interface TreeNode {
  value: number
  children: TreeNode[]
}

const TreeNodeSchema: S.Schema<TreeNode> = S.Struct({  // ✅
  value: S.Number,
  children: S.Array(S.suspend(() => TreeNodeSchema)),
})
```

**规则:** 递归 Schema 需要先定义 TypeScript 接口，再在 Schema 变量上标注类型。

## 7. 本章小结

本章将 Schema 从"校验器"提升为"可组合的类型系统"，涵盖了 Schema 进阶的五个核心领域：

- **Union / Literal / TemplateLiteral:** 构建联合类型、字面量类型和模板字面量模式。`Schema.Literals` 用于多值字面量，`Schema.Union` 用于 Schema 联合，`TemplateLiteral` 用于模板匹配
- **Transform 变换:** 使用 `SchemaTransformation.transform` 创建双向变换，`transformOrFail` 创建可失败变换。变换是 Schema 最强大的特性，让 Schema 成为真正的"类型转换器"
- **Extend / Omit / Pick / Partial:** 通过 Struct 组合手动实现 Schema 的扩展和裁剪。虽然不如内置 API 方便，但提供了最大的灵活性
- **递归 Schema:** 使用 `S.suspend` 构建树形结构等自引用数据类型。递归 Schema 需要 TypeScript 接口 + `suspend` 工厂函数双重保障
- **API 类型系统:** 使用 Schema 构建完整的 API 类型系统，一处定义同时获得类型推导、运行时校验、序列化/反序列化

**核心模式 — Schema 作为"单一真相源":**

```
Schema 定义
    ├── typeof Schema.Type → TypeScript 类型 (编译时)
    ├── decodeUnknownSync → 运行时校验 (运行时)
    ├── encodeSync → 序列化 (运行时)
    └── toTaggedUnion → 可区分联合 (组合)
```

掌握这些进阶技能后，你已经能够使用 Schema 构建生产级的类型安全系统。从下一章开始，我们将进入 Effect 模式（Chapter 10）和 Fiber 并发模型（Chapter 11），构建完整的 Effect-TS 应用。

# 第 3 章示例：Schema 运行时类型安全

本章通过四个可独立运行的 TypeScript 文件，从"基础结构定义"到"类风格定义"再到"编解码"和"类型推导"，逐步建立对 Effect-TS Schema 系统的完整理解。

## 学习路径

按以下顺序阅读和运行示例：

### 1. `01-basic-struct.ts` — Schema.Struct 基础

**运行:** `bun run src/01-basic-struct.ts`

展示 Schema 的核心构造器：
- `Schema.Struct` — 定义对象结构
- `Schema.String` / `Schema.Number` / `Schema.Boolean` — 基本类型
- `Schema.Literal` — 字面量/枚举值
- `Schema.optional` — 可选字段
- `Schema.Array` — 数组类型
- `Schema.Record` — 字典/映射类型
- `Schema.check` + `Schema.isGreaterThan` — 数值约束
- `Schema.decodeUnknownSync` — 同步校验

**学习要点:** 理解 Schema 如何同时提供运行时校验和 TypeScript 类型推导。注意数值约束使用 `Schema.check(Schema.isGreaterThan(0))` 而非 `Schema.positive()`。

### 2. `02-class-and-tag.ts` — Schema.Class 与 Schema.Tag

**运行:** `bun run src/02-class-and-tag.ts`

展示 Schema 的类风格定义和标签系统：
- `Schema.Class` — 类风格定义（校验 + 实例化 + 方法）
- `Schema.TaggedErrorClass` — 带 `_tag` 的错误类
- `Schema.TaggedStruct` — 带 `_tag` 的结构体
- `Schema.tag` — 带构造默认值的 Literal 字段
- `Schema.Union` — 可区分联合类型

**学习要点:** 理解 `_tag` 字段在错误处理和联合类型中的作用。对比 Schema.Class 与普通 class 的本质差异。

### 3. `03-encode-decode.ts` — 序列化与反序列化

**运行:** `bun run src/03-encode-decode.ts`

展示 Schema 的编解码操作：
- `Schema.decodeUnknownSync` — unknown → Type（同步）
- `Schema.encodeSync` — Type → Encoded（同步）
- `Schema.decodeUnknown` — unknown → Type（Effect 版本）
- JSON 往返完整流程
- `Schema.compose` — 自定义类型转换（字符串↔数字、字符串↔日期）

**学习要点:** 理解 Type（业务类型）与 Encoded（传输类型）的区别。掌握 JSON 往返的标准流程。

### 4. `04-type-inference.ts` — Schema 与 TypeScript 类型双向推导

**运行:** `bun run src/04-type-inference.ts`

展示 Schema 的类型推导能力：
- `Schema.Schema.Type` — Schema → TypeScript 类型
- `Schema.Codec.Encoded` — Schema → 编码类型
- `Schema.toStandardSchemaV1` — Standard Schema v1 兼容
- Schema 作为"单一真相源"的理念

**学习要点:** 理解"类型定义 + 校验规则 = 同一处维护"的核心价值。了解 Standard Schema v1 的跨库互操作能力。

## 前置知识

- 第 2 章：Effect 类型入门（`Effect<R, E, A>`、`pipe`、`Effect.gen`）
- TypeScript 泛型基础
- JSON 序列化/反序列化基础

## 技术说明

- Effect 版本: `4.0.0-beta.65`
- 运行环境: Bun
- 每个 `.ts` 文件可独立运行，无相互依赖

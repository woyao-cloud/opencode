# 第 3 章示例：Schema 运行时类型安全

本章通过四个可独立运行的 TypeScript 文件，从"基础结构定义"到"类风格定义"再到"编解码与类型推导"，逐步建立对 Effect-TS Schema 系统的完整理解。

## 学习路径

按以下顺序阅读和运行示例：

### 1. `01-basic-struct.ts` — Schema.Struct 基础

**运行:** `bun run src/01-basic-struct.ts`

展示 Schema 的核心构造器：
- `Schema.Struct` — 定义固定字段的对象结构
- `Schema.String` / `Schema.Number` / `Schema.Boolean` — 基础类型
- `Schema.Literal` — 字面量联合类型
- `Schema.optional` — 可选字段
- `Schema.Array` / `Schema.Record` — 数组与字典类型
- `Schema.GreaterThan` / `Schema.between` — 数值约束
- `Schema.decodeSync` / `Schema.decodeUnknownSync` — 同步校验

**学习要点:** 理解 Schema 如何在运行时提供 TypeScript 编译后消失的类型安全保障。观察校验失败时的错误信息格式。

### 2. `02-class-and-tag.ts` — Schema.Class 与 Schema.Tag

**运行:** `bun run src/02-class-and-tag.ts`

展示类风格的数据定义：
- `Schema.Class` — 既是 class 又是 Schema，支持方法和 getter
- `Schema.TaggedStruct` — 带 `_tag` 字段的结构体（联合类型基础）
- `Schema.TaggedErrorClass` — 带 `_tag` 的错误类（继承 Error）
- `Schema.Union` — 联合类型
- Schema.Class vs 普通 class 的运行时校验对比

**学习要点:** 理解 `_tag` 字段在 Effect-TS 类型系统中的关键作用。掌握 Schema.Class 作为"单一真相源"的类定义模式。

### 3. `03-encode-decode.ts` — 序列化与反序列化

**运行:** `bun run src/03-encode-decode.ts`

展示数据的编解码流程：
- `Schema.decodeUnknown` — Effect 版本解码（适合管道）
- `Schema.decodeSync` / `Schema.decodeUnknownSync` — 同步版本
- `Schema.encodeSync` / `Schema.encodeUnknownSync` — 编码/序列化
- JSON 序列化往返（parse → decode → 处理 → encode → stringify）
- `Schema.transform` — 自定义编解码转换（如 string ↔ Date）

**学习要点:** 理解 Effect 版本和同步版本的区别。掌握 JSON 往返的完整数据管道模式。理解 transform 的 decode/encode 双向转换。

### 4. `04-type-inference.ts` — Schema 与 TypeScript 类型双向推导

**运行:** `bun run src/04-type-inference.ts`

展示 Schema 的类型推导能力：
- `typeof schema.Type` — Schema → TypeScript 类型
- `typeof schema.Encoded` — Schema → 编码/传输类型
- `Schema.standardSchemaV1` — 与 Standard Schema 规范兼容
- Schema 作为"单一真相源"的设计理念

**学习要点:** 理解 Type 和 Encoded 的区别（有 transform 时不同）。理解 Schema 如何消除"类型定义 + 校验逻辑"的双重维护问题。

## 前置知识

- 第 2 章：Effect 类型入门（`Effect<R, E, A>`、`pipe`、`Effect.gen`）
- TypeScript 泛型基础
- 对运行时类型校验的基本认知（如 Zod、Yup 等库的概念）

## 技术说明

- Effect 版本: `4.0.0-beta.65`
- 运行环境: Bun
- 每个 `.ts` 文件可独立运行，无相互依赖
- 代码注释使用中文，变量/函数名使用英文

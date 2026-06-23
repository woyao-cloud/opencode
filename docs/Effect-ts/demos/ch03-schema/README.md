# 第 3 章示例：Schema 运行时类型安全

本章 4 个示例演示 Effect-TS Schema 的核心用法。

## 运行环境准备

```bash
cd demos/ch03-schema
bun install
```

## 示例列表

### 01-basic-struct.ts — Schema.Struct 基础

**运行:** `bun run src/01-basic-struct.ts`

演示内容：
- `Schema.Struct` 定义数据结构
- `Schema.String`、`Schema.Number`、`Schema.Literal`
- `Schema.optional`、`Schema.Array`、`Schema.Record`
- `Schema.check` + `Schema.is*` 谓词实现数值约束
- `Schema.decodeUnknownSync` 同步校验
- 校验失败时的错误信息

### 02-class-and-tag.ts — Schema.Class 与 Schema.Tag

**运行:** `bun run src/02-class-and-tag.ts`

演示内容：
- `Schema.Class` 类风格定义（含实例方法和静态工厂）
- 带 `_tag` 的错误类模式（Schema.Class + 显式 `_tag` 字段）
- `Schema.TaggedStruct` 带 tag 的结构体
- `Schema.Union` + `toTaggedUnion` 可区分联合
- Schema.Class 与普通 TypeScript class 的对比
- OpenCode `Usage` 类模式参考（TokenUsage 示例）

### 03-encode-decode.ts — 序列化与反序列化

**运行:** `bun run src/03-encode-decode.ts`

演示内容：
- `decodeUnknownSync` / `encodeUnknownSync` 同步编解码
- `decodeUnknownEffect` / `encodeUnknownEffect` Effect 原生集成
- JSON 序列化往返（JSON → decode → 类型安全操作 → encode → JSON）
- `decodeUnknownOption` 不抛异常的校验
- 自定义数据清洗流程

### 04-type-inference.ts — Schema 与 TypeScript 类型双向推导

**运行:** `bun run src/04-type-inference.ts`

演示内容：
- `typeof schema.Type` — Schema → TypeScript 类型
- `typeof schema.Encoded` — 编码类型（与 Type 的差异）
- `Schema.toStandardSchemaV1` — Standard Schema 规范兼容
- Schema 作为"单一真相源"：类型定义 + 校验规则一处维护
- 嵌套结构的类型推导

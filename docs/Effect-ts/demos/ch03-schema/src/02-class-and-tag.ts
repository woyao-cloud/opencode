/**
 * 02-class-and-tag.ts — Schema.Class 与 Schema.Tag
 *
 * 学习目标: 掌握 Schema.Class 类风格定义、Schema.TaggedErrorClass 带 tag 的错误类、
 *          Schema.TaggedStruct 带 tag 的结构体，理解类实例化与方法定义
 * 前置章节: 第 2 章（Effect 类型入门）
 * 运行方式: bun run src/02-class-and-tag.ts
 */

import { Schema } from "effect"

// ============================================================
// 1. Schema.Class — 类风格定义
// ============================================================
// Schema.Class 将 Schema 定义与 JavaScript class 结合。
// 语法: class X extends Schema.Class<X>("标识符")({ 字段定义 }) { 方法 }
// 优势: 同时获得运行时校验 + TypeScript 类型 + 可实例化的类

class Person extends Schema.Class<Person>("Person")({
  name: Schema.String,
  age: Schema.Number.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  email: Schema.optional(Schema.String),
}) {
  // 可以在类体中定义方法
  get displayName() {
    return `${this.name} (${this.age}岁)`
  }

  isAdult() {
    return this.age >= 18
  }
}

console.log("--- 1. Schema.Class ---")

// 实例化 — 构造函数自动校验输入
const alice = new Person({ name: "Alice", age: 30, email: "alice@example.com" })
console.log("Alice:", alice)
console.log("  displayName:", alice.displayName)
console.log("  isAdult:", alice.isAdult())

const bob = new Person({ name: "Bob", age: 15 })
console.log("Bob:", bob)
console.log("  displayName:", bob.displayName)
console.log("  isAdult:", bob.isAdult())

// 非法输入 — 构造时抛出异常
try {
  new Person({ name: "Eve", age: -5 })
} catch (err) {
  console.log("非法 Person (age=-5):", (err as Error).message)
}

// ============================================================
// 2. Schema.TaggedErrorClass — 带 tag 的错误类
// ============================================================
// Schema.TaggedErrorClass 自动添加 _tag 字面量字段。
// 语法: class X extends Schema.TaggedErrorClass<X>()("Tag", { 字段 }) {}
// 用途: 定义可区分的错误类型，配合 Effect 的错误通道使用
//
// 重要: TaggedErrorClass 继承 YieldableError，实例化时会抛出自身。
// 这是设计行为 — 错误类用于 throw/yield*，不是用于存储到变量。

class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("NotFoundError", {
  resource: Schema.String,
  id: Schema.Number,
}) {
  get message() {
    return `未找到 ${this.resource} (id=${this.id})`
  }
}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()("ValidationError", {
  field: Schema.String,
  reason: Schema.String,
}) {
  get message() {
    return `字段 ${this.field} 校验失败: ${this.reason}`
  }
}

console.log("\n--- 2. Schema.TaggedErrorClass ---")

// TaggedErrorClass 实例化时会抛出自身（继承 YieldableError）
// 正确用法: 在 Effect.gen 中 yield* new NotFoundError(...)
// 演示时用 try/catch 捕获以查看其属性

try {
  new NotFoundError({ resource: "User", id: 42 })
} catch (err) {
  console.log("捕获 NotFoundError:")
  console.log("  _tag:", (err as NotFoundError)._tag)
  console.log("  message:", (err as NotFoundError).message)
  console.log("  resource:", (err as NotFoundError).resource)
  console.log("  id:", (err as NotFoundError).id)
}

try {
  new ValidationError({ field: "email", reason: "格式不正确" })
} catch (err) {
  console.log("捕获 ValidationError:")
  console.log("  _tag:", (err as ValidationError)._tag)
  console.log("  message:", (err as ValidationError).message)
}

// _tag 字段是自动添加的，用于区分不同错误类型
console.log("\n_tag 的作用: 在 Effect 错误通道中区分错误类型")
console.log("  NotFoundError._tag = 'NotFoundError'")
console.log("  ValidationError._tag = 'ValidationError'")
console.log("  通过 _tag 可以精确匹配错误类型，实现类型安全的错误处理")

// ============================================================
// 3. Schema.TaggedStruct — 带 tag 的结构体
// ============================================================
// Schema.TaggedStruct 创建一个带 _tag 字面量的 Struct（非 class）。
// 语法: Schema.TaggedStruct("tag值", { 字段 })
// 用途: 定义可区分的数据结构，配合 Schema.Union 使用

const CircleShape = Schema.TaggedStruct("circle", {
  radius: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
})

const RectangleShape = Schema.TaggedStruct("rectangle", {
  width: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
  height: Schema.Number.pipe(Schema.check(Schema.isGreaterThan(0))),
})

// 用 Schema.Union 组合多个 TaggedStruct
// 注意: Schema.Union 接受数组参数，不是可变参数
const ShapeSchema = Schema.Union([CircleShape, RectangleShape])

type Circle = Schema.Schema.Type<typeof CircleShape>
type Rectangle = Schema.Schema.Type<typeof RectangleShape>
type Shape = Schema.Schema.Type<typeof ShapeSchema>

console.log("\n--- 3. Schema.TaggedStruct ---")

const circle = Schema.decodeUnknownSync(ShapeSchema)({
  _tag: "circle",
  radius: 5,
})
console.log("圆形:", circle)
console.log("  面积:", Math.PI * circle.radius * circle.radius)

const rectangle = Schema.decodeUnknownSync(ShapeSchema)({
  _tag: "rectangle",
  width: 10,
  height: 20,
})
console.log("矩形:", rectangle)
console.log("  面积:", rectangle.width * rectangle.height)

// 未知 tag 被拒绝
try {
  Schema.decodeUnknownSync(ShapeSchema)({ _tag: "triangle", base: 3, height: 4 })
} catch (err) {
  console.log("未知 tag 'triangle' 被拒绝:", (err as Error).message)
}

// ============================================================
// 4. Schema.tag — 单个 tag 字段
// ============================================================
// Schema.tag("值") 创建一个带构造默认值的 Literal 字段。
// 常用于 Struct 中手动添加 _tag 字段。
//
// 注意: 构造默认值仅在 make/Class 构造时生效，decodeUnknownSync 仍需提供字段。
// 如需解码时省略 tag，使用 Schema.tagDefaultOmit。

const ManualTaggedStruct = Schema.Struct({
  _tag: Schema.tag("manual-event"),
  payload: Schema.String,
})

console.log("\n--- 4. Schema.tag ---")
// decodeUnknownSync 要求提供 _tag（构造默认值在解码时不生效）
const event = Schema.decodeUnknownSync(ManualTaggedStruct)({
  _tag: "manual-event",
  payload: "hello",
})
console.log("手动 tag 结构体:", event)
console.log("  _tag:", event._tag)

// Schema.tagDefaultOmit — 解码时可省略的 tag
const AutoTagStruct = Schema.Struct({
  _tag: Schema.tagDefaultOmit("auto-event"),
  payload: Schema.String,
})

const autoEvent = Schema.decodeUnknownSync(AutoTagStruct)({ payload: "world" })
console.log("tagDefaultOmit 结构体 (省略 _tag):", autoEvent)
console.log("  _tag 自动填充:", autoEvent._tag)

// ============================================================
// 5. Schema.Class 与普通 class 对比
// ============================================================
// 普通 class 没有运行时校验，类型只在编译时存在。

class PlainPerson {
  constructor(
    readonly name: string,
    readonly age: number,
  ) {}
}

console.log("\n--- 5. Schema.Class vs 普通 class ---")
console.log("┌──────────────────────┬────────────────────┬────────────────────┐")
console.log("│ 特性                 │ Schema.Class       │ 普通 class         │")
console.log("├──────────────────────┼────────────────────┼────────────────────┤")
console.log("│ 运行时校验           │ 自动校验           │ 无                 │")
console.log("│ 类型推导             │ Schema.Type 提取   │ 手动标注           │")
console.log("│ 序列化支持           │ encode/decode      │ 需手工实现         │")
console.log("│ 错误信息             │ 结构化 ParseError  │ 无                 │")
console.log("│ 标识符               │ 有 (identifier)    │ 无                 │")
console.log("│ 可扩展               │ extend() 方法      │ extends 关键字    │")
console.log("└──────────────────────┴────────────────────┴────────────────────┘")

// 演示: 普通 class 无法阻止非法数据
const badPlain = new PlainPerson("", -100)  // 没有任何校验
console.log("普通 class 接受非法数据:", badPlain)
console.log("  name='' (空字符串), age=-100 (负数) — 没有任何阻止")

// ============================================================
// 6. 总结
// ============================================================
console.log("\n--- 6. 总结 ---")
console.log("关键理解:")
console.log("  - Schema.Class: Schema 校验 + class 实例化 + 方法定义")
console.log("  - Schema.TaggedErrorClass: 自动添加 _tag 的错误类，实例化时抛出自身")
console.log("  - Schema.TaggedStruct: 带 _tag 的结构体，用于可区分联合类型")
console.log("  - Schema.tag: 带构造默认值的 Literal 字段")
console.log("  - Schema.Union: 组合多个带 tag 的 Schema 为可区分联合（接受数组参数）")

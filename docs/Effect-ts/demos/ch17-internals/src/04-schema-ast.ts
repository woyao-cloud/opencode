/**
 * Demo 04: Schema AST Structure and Compiler
 *
 * 展示 Schema 的内部 AST（抽象语法树）结构和编译器工作原理。
 * Effect-TS 的 Schema 系统将类型定义编译为内部 AST，
 * 然后通过不同的编译器将 AST 转换为解析器、序列化器、JSON Schema 等。
 *
 * 关键概念：
 * - Schema 定义被编译为 AST 节点树
 * - AST 是 Schema 系统的中间表示（IR）
 * - 不同的编译器（Parser, Serializer, JSON Schema）消费同一个 AST
 * - AST 节点通过组合形成复杂类型（struct, union, transform 等）
 * - 编译器是 AST 的 fold/interpreter
 */

import { Schema, pipe } from "effect"

// ============================================================
// 简化版 Schema AST 模型（仅供理解，非生产代码）
// ============================================================

/**
 * Schema AST 节点类型
 *
 * 真实的 Effect-TS Schema AST 有更多节点类型（Brand, Transform, TemplateLiteral 等），
 * 这里展示核心的几种。
 */
type SchemaAST =
  | StringAST
  | NumberAST
  | BooleanAST
  | LiteralAST
  | StructAST
  | ArrayAST
  | UnionAST
  | TransformAST
  | OptionalAST

interface StringAST { readonly _tag: "String" }
interface NumberAST { readonly _tag: "Number" }
interface BooleanAST { readonly _tag: "Boolean" }
interface LiteralAST { readonly _tag: "Literal"; readonly value: string | number | boolean }
interface StructAST { readonly _tag: "Struct"; readonly fields: Record<string, SchemaAST> }
interface ArrayAST { readonly _tag: "Array"; readonly element: SchemaAST }
interface UnionAST { readonly _tag: "Union"; readonly members: readonly SchemaAST[] }
interface TransformAST { readonly _tag: "Transform"; readonly from: SchemaAST; readonly to: SchemaAST }
interface OptionalAST { readonly _tag: "Optional"; readonly inner: SchemaAST }

// AST 构造器
const ast = {
  string: (): StringAST => ({ _tag: "String" }),
  number: (): NumberAST => ({ _tag: "Number" }),
  boolean: (): BooleanAST => ({ _tag: "Boolean" }),
  literal: (value: string | number | boolean): LiteralAST => ({ _tag: "Literal", value }),
  struct: (fields: Record<string, SchemaAST>): StructAST => ({ _tag: "Struct", fields }),
  array: (element: SchemaAST): ArrayAST => ({ _tag: "Array", element }),
  union: (...members: SchemaAST[]): UnionAST => ({ _tag: "Union", members }),
  transform: (from: SchemaAST, to: SchemaAST): TransformAST => ({ _tag: "Transform", from, to }),
  optional: (inner: SchemaAST): OptionalAST => ({ _tag: "Optional", inner })
}

/**
 * AST 转 TypeScript 类型字符串 —— 编译器示例 1
 *
 * 这是一个简化的编译器，将 AST 转为 TypeScript 类型字符串。
 * 真实的 Schema 系统使用更复杂的类型推导（通过 TypeScript 的类型系统），
 * 但原理相同：递归遍历 AST，为每个节点生成对应的输出。
 */
const compileToTypeString = (node: SchemaAST): string => {
  switch (node._tag) {
    case "String":
      return "string"
    case "Number":
      return "number"
    case "Boolean":
      return "boolean"
    case "Literal":
      return typeof node.value === "string" ? `"${node.value}"` : String(node.value)
    case "Struct": {
      const fields = Object.entries(node.fields)
        .map(([key, value]) => `  ${key}: ${compileToTypeString(value)}`)
        .join("\n")
      return `{\n${fields}\n}`
    }
    case "Array":
      return `${compileToTypeString(node.element)}[]`
    case "Union":
      return node.members.map(compileToTypeString).join(" | ")
    case "Transform":
      // Transform 在类型层面等同于 from 的类型
      return compileToTypeString(node.from)
    case "Optional":
      return `${compileToTypeString(node.inner)} | undefined`
  }
}

/**
 * AST 转 JSON Schema —— 编译器示例 2
 *
 * JSON Schema 是另一个编译器目标。
 * 同一个 AST 可以被编译为不同的输出格式。
 */
const compileToJSONSchema = (node: SchemaAST): Record<string, unknown> => {
  switch (node._tag) {
    case "String":
      return { type: "string" }
    case "Number":
      return { type: "number" }
    case "Boolean":
      return { type: "boolean" }
    case "Literal":
      return { type: typeof node.value as string, const: node.value }
    case "Struct": {
      const properties: Record<string, unknown> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(node.fields)) {
        if (value._tag === "Optional") {
          properties[key] = compileToJSONSchema(value.inner)
        } else {
          properties[key] = compileToJSONSchema(value)
          required.push(key)
        }
      }
      return {
        type: "object",
        properties,
        required,
        additionalProperties: false
      }
    }
    case "Array":
      return { type: "array", items: compileToJSONSchema(node.element) }
    case "Union":
      return { anyOf: node.members.map(compileToJSONSchema) }
    case "Transform":
      return compileToJSONSchema(node.from)
    case "Optional":
      // Optional 在 JSON Schema 层面不生成额外结构
      // 由父级 Struct 处理 required 列表
      return compileToJSONSchema(node.inner)
  }
}

/**
 * AST 美化打印 —— 编译器示例 3
 *
 * 展示 AST 的树形结构，用于调试和理解。
 */
const printAST = (node: SchemaAST, indent = 0): string => {
  const pad = "  ".repeat(indent)
  switch (node._tag) {
    case "String":
    case "Number":
    case "Boolean":
      return `${pad}${node._tag}`
    case "Literal":
      return `${pad}Literal(${JSON.stringify(node.value)})`
    case "Struct": {
      const fields = Object.entries(node.fields)
        .map(([k, v]) => `${pad}  ${k}: ${printAST(v, indent + 2).trimStart()}`)
        .join("\n")
      return `${pad}Struct {\n${fields}\n${pad}}`
    }
    case "Array":
      return `${pad}Array<\n${printAST(node.element, indent + 1)}\n${pad}>`
    case "Union":
      return `${pad}Union(\n${node.members.map((m) => printAST(m, indent + 1)).join(",\n")}\n${pad})`
    case "Transform":
      return `${pad}Transform(\n${printAST(node.from, indent + 1)} →\n${printAST(node.to, indent + 1)}\n${pad})`
    case "Optional":
      return `${pad}Optional(${printAST(node.inner, indent).trimStart()})`
  }
}

// ============================================================
// 演示：构建 AST 并使用不同编译器
// ============================================================

console.log("=".repeat(60))
console.log("Demo 04: Schema AST 结构和编译器")
console.log("=".repeat(60))

// 构建一个用户 Schema 的 AST
// 等价于: Schema.Struct({ name: Schema.String, age: Schema.Number, tags: Schema.Array(Schema.String) })
const userAST = ast.struct({
  name: ast.string(),
  age: ast.number(),
  email: ast.optional(ast.string()),
  tags: ast.array(ast.string()),
  role: ast.union(ast.literal("admin"), ast.literal("user"))
})

console.log("\n--- AST 树形结构 ---")
console.log(printAST(userAST))

console.log("\n--- 编译为 TypeScript 类型 ---")
console.log(compileToTypeString(userAST))

console.log("\n--- 编译为 JSON Schema ---")
console.log(JSON.stringify(compileToJSONSchema(userAST), null, 2))

// ============================================================
// 演示：使用真实 Effect-TS Schema 系统
// ============================================================

console.log("\n--- 真实 Effect-TS Schema 对比 ---")

// 使用真实 Schema 定义相同的类型（避免使用可能有兼容性问题的 API）
const UserSchema = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
  email: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String),
  role: Schema.Literal("admin", "user")
})

// 推断 TypeScript 类型
type User = Schema.Schema.Type<typeof UserSchema>

// 使用 Schema 解析数据
const validData = {
  name: "Alice",
  age: 30,
  tags: ["engineer", "mentor"],
  role: "admin" as const
}

const parseResult = Schema.decodeUnknownSync(UserSchema)(validData)
console.log("✅ 解析成功:", JSON.stringify(parseResult))

// 使用 Schema 编码（序列化）
const encoded = Schema.encodeSync(UserSchema)(parseResult)
console.log("✅ 编码结果:", JSON.stringify(encoded))

// 使用 Schema.decodeUnknownSync 验证 Schema 的运行时能力
// （beta.65 中 Schema.to 用于 JSON Schema 生成不可用，简化演示）
console.log("✅ Schema 类型信息在编译时和运行时均可用")

// 展示 Transform 的 AST
console.log("\n--- Transform AST 示例 ---")
const transformAST = ast.transform(
  ast.string(),
  ast.number()
)
console.log(printAST(transformAST))
console.log("TypeScript 类型:", compileToTypeString(transformAST))

// ============================================================
// 知识点总结
// ============================================================
console.log("\n📚 关键概念:")
console.log("1. Schema 定义被编译为内部 AST（中间表示）")
console.log("2. AST 是类型信息的运行时载体")
console.log("3. 不同编译器消费同一个 AST 生成不同输出")
console.log("4. 编译器本质上是 AST 的递归 fold/interpreter")
console.log("5. Transform 节点表示类型转换（如 string → Date）")
console.log("6. 真实实现包含更多 AST 节点（Brand, TemplateLiteral 等）")

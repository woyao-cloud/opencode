/**
 * 04-recursive.ts — 递归 Schema (Recursive)
 *
 * 演示使用 S.suspend 创建递归 Schema，用于树形结构等自引用数据类型。
 * 注意: beta.65 中使用 S.suspend 而非 Schema.Lazy。
 * 运行: bun run src/04-recursive.ts
 */

import { Schema, SchemaTransformation } from "effect"
import * as S from "effect/Schema"

// ============================================================
// 1. 基础递归: 树形结构
// ============================================================

console.log("=== 1. 树形结构 (递归) ===")

// 定义树节点 Schema
// 使用 S.suspend(() => TreeNodeSchema) 延迟引用自身
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

// 创建一个树形数据
const treeData = {
  value: 1,
  label: "根节点",
  children: [
    {
      value: 2,
      label: "子节点 A",
      children: [
        {
          value: 4,
          label: "叶子节点 A1",
          children: [],
        },
      ],
    },
    {
      value: 3,
      label: "子节点 B",
      children: [],
    },
  ],
}

// 解码
const tree = Schema.decodeUnknownSync(TreeNodeSchema)(treeData)
console.log("树形结构解码成功:", JSON.stringify(tree, null, 2))

// 编码
const encoded = Schema.encodeSync(TreeNodeSchema)(tree)
console.log("\n树形结构编码成功, 根节点值:", encoded.value)

// ============================================================
// 2. 递归深度限制
// ============================================================

console.log("\n=== 2. 递归深度限制 ===")

// 创建一个有限深度的树
const shallowTree = {
  value: 1,
  label: "浅树",
  children: [
    {
      value: 2,
      label: "深度 1",
      children: [],
    },
  ],
}

const shallowDecoded = Schema.decodeUnknownSync(TreeNodeSchema)(shallowTree)
console.log("浅树解码成功, 深度:", shallowDecoded.children.length)

// ============================================================
// 3. 递归 JSON 数据
// ============================================================

console.log("\n=== 3. 递归 JSON 数据 ===")

// 模拟从 JSON 解析的树形数据
const jsonData = JSON.parse(JSON.stringify(treeData))
const fromJson = Schema.decodeUnknownSync(TreeNodeSchema)(jsonData)
console.log("JSON 数据解码成功, 根标签:", fromJson.label)

// ============================================================
// 4. 更复杂的递归: 带元数据的树
// ============================================================

console.log("\n=== 4. 带元数据的树 ===")

interface MetaNode {
  id: string
  data: Record<string, unknown>
  children: MetaNode[]
}

const MetaNodeSchema: S.Schema<MetaNode> = S.Struct({
  id: S.String,
  data: S.Record(S.String, S.Unknown),
  children: S.Array(S.suspend(() => MetaNodeSchema)),
})

const metaTree = Schema.decodeUnknownSync(MetaNodeSchema)({
  id: "root",
  data: { type: "folder", count: 10 },
  children: [
    {
      id: "child-1",
      data: { type: "file", size: 1024 },
      children: [],
    },
  ],
})
console.log("元数据树解码成功, 子节点数:", metaTree.children.length)
console.log("子节点 data:", metaTree.children[0].data)

// ============================================================
// 5. 递归与变换结合
// ============================================================

console.log("\n=== 5. 递归与变换结合 ===")

// 定义一个树，其中 value 在外部是 string，内部是 number
const ValueTrans = SchemaTransformation.transform({
  decode: (s: string) => parseInt(s, 10),
  encode: (n: number) => n.toString(),
})

interface TransNode {
  value: number
  children: TransNode[]
}

const TransNodeSchema: S.Schema<TransNode> = S.Struct({
  value: S.String.pipe(S.decodeTo(S.Number, ValueTrans)),
  children: S.Array(S.suspend(() => TransNodeSchema)),
})

const transTree = Schema.decodeUnknownSync(TransNodeSchema)({
  value: "42",
  children: [
    {
      value: "100",
      children: [],
    },
  ],
})
console.log("变换树解码成功, 根值:", transTree.value, typeof transTree.value)
console.log("子节点值:", transTree.children[0].value, typeof transTree.children[0].value)

// 编码回 string
const transEncoded = Schema.encodeSync(TransNodeSchema)(transTree)
console.log("编码后根值:", transEncoded.value, typeof transEncoded.value)

// ============================================================
// 6. 递归与可选子节点
// ============================================================

console.log("\n=== 6. 可选子节点的递归 ===")

interface OptionalNode {
  value: number
  children?: OptionalNode[]
}

const OptionalNodeSchema: S.Schema<OptionalNode> = S.Struct({
  value: S.Number,
  children: S.optional(S.Array(S.suspend(() => OptionalNodeSchema))),
})

// 无子节点
const leaf = Schema.decodeUnknownSync(OptionalNodeSchema)({ value: 1 })
console.log("叶子节点:", leaf.value, "children:", leaf.children)

// 有子节点
const parent = Schema.decodeUnknownSync(OptionalNodeSchema)({
  value: 2,
  children: [{ value: 3 }],
})
console.log("父节点:", parent.value, "子节点数:", parent.children?.length)

console.log("\n✅ 04-recursive.ts 运行完成")

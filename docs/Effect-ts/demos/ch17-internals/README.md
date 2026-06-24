# Chapter 17: Effect-TS 实现原理

Effect-TS 内部实现原理的探索性代码演示。

## 前置知识

- 第 2 章：Effect 基础
- 第 3 章：Schema
- 第 4 章：Layer
- 第 11 章：Fiber
- 第 12 章：Stream

## 安装

```bash
npm install
```

## 运行演示

```bash
npm run demo01   # Effect 类型内部 ADT 表示
npm run demo02   # Fiber 运行时事件循环模型
npm run demo03   # Layer 依赖解析算法（拓扑排序）
npm run demo04   # Schema AST 结构和编译器
npm run demo05   # Stream Pull-Based 实现模型
```

## 演示说明

每个演示文件都包含两部分：
1. **简化实现**：手动构建的简化版模型，用于理解核心原理
2. **真实 API 对比**：使用 Effect-TS 4.0.0-beta.65 的等价代码

> ⚠️ 简化实现仅用于教学理解，不是生产代码。真实的 Effect-TS 内部实现远比这些演示复杂，但核心思想一致。

## 文件列表

| 文件 | 内容 |
|------|------|
| `01-effect-internal.ts` | Effect 类型的 ADT 表示和简化解释器 |
| `02-fiber-runtime.ts` | Fiber 运行时事件循环和调度模型 |
| `03-layer-resolution.ts` | Layer 依赖解析的拓扑排序算法 |
| `04-schema-ast.ts` | Schema AST 结构和多目标编译器 |
| `05-stream-pull.ts` | Stream Pull-Based 模型和背压机制 |

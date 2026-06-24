# 第 17 章：Effect-TS 实现原理

> **前置知识：** 第 2 章（Effect 基础）、第 3 章（Schema）、第 4 章（Layer）、第 11 章（Fiber）、第 12 章（Stream）
>
> **难度：** ⭐⭐⭐⭐⭐（高级）

## 章节概述

本章深入 Effect-TS 的内部实现原理，通过简化模型帮助理解核心设计思想。我们不会实现一个完整的 Effect-TS 运行时，而是通过"解构—重建"的方式，展示关键子系统的工作原理。

**核心目标：理解而非复现。** 每个演示包含简化实现（帮助理解原理）和真实 API 对比（展示实际用法）。

## 17.1 Effect 类型内部表示

### 为什么需要理解 Effect 的内部表示

Effect-TS 的 `Effect<R, E, A>` 类型表面上看起来像一个简单的函数签名，但其内部使用了代数数据类型（ADT）来表示不同的计算。理解这种表示有助于：

- 理解为什么 Effect 可以延迟执行
- 理解 `flatMap` 如何实现顺序组合
- 理解运行时如何"解释"Effect 程序

### ADT 编码

Effect 类型本质上是一个 tagged union，每个 tag 代表一种计算形式：

| Tag | 含义 | 示例 |
|-----|------|------|
| `Success` | 成功的值 | `Effect.succeed(42)` |
| `Failure` | 失败的值 | `Effect.fail("error")` |
| `Sync` | 同步副作用 | `Effect.sync(() => Math.random())` |
| `Async` | 异步操作 | `Effect.promise(() => fetch(...))` |
| `FlatMap` | 顺序组合 | `effect.flatMap(f)` |
| `Access` | 读取环境 | `Effect.service(MyService)` |
| `Provide` | 提供环境 | `Effect.provideService(effect, ...)` |

### 解释器模式

运行时通过模式匹配（switch-case）执行不同的 tag。每个 tag 对应特定的执行逻辑：

```
interpreter(effect):
  match effect.tag:
    Success(v)  → callback(v)
    Failure(e)  → callback(error(e))
    Sync(thunk) → callback(thunk())
    FlatMap(self, f) → interpreter(self, callback(x → interpreter(f(x))))
    ...
```

> **运行演示：** `npm run demo01`

## 17.2 Fiber 运行时事件循环

### Fiber 模型

Fiber 是 Effect-TS 的并发原语，类似于轻量级"虚拟线程"：

- **轻量级：** 一个 OS 线程上可以运行成千上万个 Fiber
- **协作式调度：** Fiber 主动让出（yield）执行权，而非抢占式
- **结构化并发：** 父 Fiber 监督子 Fiber 的生命周期

### 事件循环架构

```
┌──────────────────────────────────┐
│         Runtime Scheduler        │
│  ┌────────┐  ┌────────┐        │
│  │ Fiber 1│  │ Fiber 2│  ...   │
│  └────────┘  └────────┘        │
│       ↓ yield      ↓ yield      │
│  ┌──────────────────────────┐   │
│  │     Ready Queue          │   │
│  └──────────────────────────┘   │
│       ↑ schedule                │
└──────────────────────────────────┘
```

调度器不断从就绪队列中取出 Fiber 执行。每个 Fiber 执行一小段时间片后主动让出（yield），放回队列末尾。

### 调度策略

- **公平调度：** 所有 Fiber 轮流执行，避免饥饿
- **协作式 yield：** Fiber 在 I/O 等待或显式 yield 时让出
- **优先级：** 真实实现支持优先级调度（简化版省略）

> **运行演示：** `npm run demo02`

## 17.3 Layer 依赖解析

### 问题定义

Layer 系统需要解决的核心问题：给定一组服务及其依赖关系，确定正确的初始化顺序。

这是一个经典的**拓扑排序**问题 —— Layer 依赖构成有向无环图（DAG）。

### 拓扑排序算法

使用 **Kahn 算法**（BFS 变体）：

```
1. 计算每个节点的入度（被多少节点依赖）
2. 将入度为 0 的节点加入队列
3. 处理队列中的节点，减少其依赖者的入度
4. 重复步骤 2-3
5. 如果处理了所有节点 → 成功
6. 如果有剩余节点 → 存在循环依赖
```

时间复杂度 O(V + E)，空间复杂度 O(V + E)。

### 循环依赖检测

循环依赖在构建时被检测。使用 DFS 三色标记法：

- **白色：** 未访问
- **灰色：** 正在访问（在递归栈中）
- **黑色：** 已完成

如果在 DFS 中遇到灰色节点，说明存在环。

> **运行演示：** `npm run demo03`

## 17.4 Schema AST 和编译器

### AST 作为中间表示

Schema 系统的核心设计是将类型定义编译为内部 AST（抽象语法树），然后通过不同编译器消费这个 AST：

```
Schema 定义
    │
    ▼
  AST (中间表示)
    │
    ├──▶ Parser 编译器     → 运行时解析器
    ├──▶ Serializer 编译器 → 运行时序列化器
    ├──▶ Type 编译器       → TypeScript 类型推导
    └──▶ JSON Schema 编译器 → JSON Schema 生成
```

### AST 节点类型

| 节点 | 含义 |
|------|------|
| `StringAST` | 字符串类型 |
| `NumberAST` | 数字类型 |
| `StructAST` | 对象/结构体 |
| `ArrayAST` | 数组类型 |
| `UnionAST` | 联合类型 |
| `TransformAST` | 类型转换 |
| `OptionalAST` | 可选字段 |
| `LiteralAST` | 字面量类型 |

### 编译器原理

编译器本质上是 AST 的递归解释器（fold）。每个编译器遍历 AST 并生成对应的输出：

- **TypeScript 类型编译器**：生成类型字符串
- **JSON Schema 编译器**：生成 JSON Schema 对象
- **Parser 编译器**：生成运行时解析函数

> **运行演示：** `npm run demo04`

## 17.5 Stream Pull-Based 模型

### Push vs Pull

大多数响应式库使用 **push-based** 模型（生产者推送数据给消费者），而 Effect-TS Stream 使用 **pull-based** 模型：

```
Push-based:   Producer ──data──▶ Consumer (生产者控制速度)
Pull-based:   Producer ◀──pull── Consumer (消费者控制速度)
```

### Pull Step 状态机

每次消费者拉取时，Stream 返回三种可能的状态：

| 状态 | 含义 | 后续行为 |
|------|------|----------|
| `Emit(value, rest)` | 产生一个值 | 消费者处理值，然后继续拉取 rest |
| `Skip(rest)` | 跳过当前元素 | 消费者继续拉取 rest |
| `Halt(exit)` | 流结束 | 消费者停止拉取 |

### 背压（Backpressure）

Pull-based 模型天然支持背压：消费者按自己的节奏拉取数据，生产者的生产速度由消费者的拉取频率决定。不需要额外的缓冲区或速率控制机制。

### 操作符的惰性求值

Stream 操作符（map, filter, take 等）是惰性的 —— 只有在消费者拉取时才执行：

```typescript
// filter 操作符的内部实现（简化版）
const filter = (stream, predicate) => ({
  pull: (env) =>
    stream.pull(env).flatMap((step) => {
      if (step._tag === "Emit" && !predicate(step.value)) {
        return Effect.succeed({ _tag: "Skip", rest: filter(step.rest, predicate) })
      }
      return Effect.succeed(step)
    })
})
```

> **运行演示：** `npm run demo05`

## 17.6 真实架构 vs 简化模型

| 概念 | 简化模型 | 真实 Effect-TS |
|------|----------|----------------|
| Effect 编码 | 简单 tagged union | GADT + phantom types + variance |
| 解释器 | 递归 switch-case | Trampoline + Fiber scheduler |
| Layer 解析 | Kahn 算法 | 增量解析 + memoization + Scope |
| Schema AST | 基础节点类型 | 完整节点集 + Brand + TemplateLiteral |
| Stream 模型 | Pull-based | Channel 抽象（更通用） |
| 并发 | 简单事件循环 | 工作窃取 + 优先级 + 公平调度 |

## 本章小结

- **Effect 是数据结构**：Effect 类型用 ADT 表示计算，运行时通过解释器执行
- **Fiber 是执行单元**：轻量级虚拟线程，协作式调度，结构化并发
- **Layer 用拓扑排序**：依赖图是 DAG，Kahn 算法确定初始化顺序
- **Schema 用 AST 编译**：中间表示统一类型信息，多编译器消费同一 AST
- **Stream 是 Pull-Based**：消费者控制数据流速，天然支持背压

理解这些内部原理能帮助你：
1. 更好地调试复杂 Effect 程序
2. 理解性能特征和优化方向
3. 为贡献 Effect-TS 源码打下基础

---

> **运行所有演示：**
> ```bash
> cd docs/Effect-ts/demos/ch17-internals
> npm install
> npm run demo01 && npm run demo02 && npm run demo03 && npm run demo04 && npm run demo05
> ```

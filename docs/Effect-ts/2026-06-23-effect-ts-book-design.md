# Effect-TS 深入讲解书籍 — 设计文档

> 状态：已确认 | 日期：2026-06-23 | 版本：v1.0

## 1. 项目概述

编写一本面向 TypeScript 开发者的 Effect-TS 深入讲解书籍，帮助准备在生产中采用 Effect-TS 的开发者从入门到精通。

## 2. 目标读者

TypeScript 开发者，已听说 Effect-TS 并准备在生产项目中采用。需要从基础概念到进阶原理的完整学习路径。

## 3. 设计决策

| 维度 | 决定 |
|---|---|
| 语言 | 中文 |
| 覆盖范围 | 核心 + 并发（Effect/Layer/Schema/Scope/Stream/Fiber/Queue/Deferred/SynchronizedRef 等） |
| 内容比例 | 概念讲解与代码示例 50/50 |
| 章节规模 | 20 章，五部分 |
| 示例形式 | 每章独立子目录 + package.json，`bun run` 即可运行 |
| Effect 版本 | 4.0.0-beta.65（对齐 OpenCode 项目） |
| 示例存放 | `docs/Effect-ts/demos/<chapter-id>/` |
| 时间节奏 | 先完整规划大纲，逐章推进，不设硬性截止日期 |

## 4. 全书结构

### 第一部分：基础入门（第 1-5 章）

从 TypeScript 开发者的痛点出发，建立 Effect-TS 的核心心智模型。

| 章节 | 主题 | 核心内容 | OpenCode 参考 |
|---|---|---|---|
| 01 | 为什么需要 Effect-TS？ | TS 三大痛点（Promise 错误不完整、DI 靠手工、副作用不可控）；Effect 将副作用建模为数据类型；与 fp-ts/zod 对比 | — |
| 02 | Effect 类型入门 | `Effect<R, E, A>` 三参数模型；`succeed/fail/sync/tryPromise`；`pipe/flow` 组合；`Effect.gen` + `yield*` 生成器语法 | — |
| 03 | Schema — 运行时类型安全 | `Struct/Class/Tag`；数据校验与序列化；Schema 与 TS 类型的关系；`encode/decode` | `llm/src/schema/events.ts` Usage Schema |
| 04 | Context 与 Layer — 依赖注入 | `Context.Tag` 声明接口；`Layer` 构建依赖图；`provide/provideMerge`；Layer 组合 | `runtime-flags.ts` Service 模式 |
| 05 | 错误处理模型 | `catchTag/catchAll`；`Cause` 类型体系（Fail/Die/Interrupt）；retry/fallback/orElse；与 try/catch 的思维差异 | `effect/promise.ts` Cause 处理 |

### 第二部分：核心工具（第 6-10 章）

掌握 Effect-TS 生产开发中最常用的五个核心工具。

| 章节 | 主题 | 核心内容 | OpenCode 参考 |
|---|---|---|---|
| 06 | Scope — 资源生命周期管理 | 可取消的资源作用域；`acquireRelease` 模式；`Scope.fork` 子作用域；`addFinalizer` 清理钩子 | `file/index.ts` 文件句柄管理 |
| 07 | Config — 配置管理 | `Config.string/number/boolean`；`withDefault/orElse`；`ConfigProvider` 多源加载；配置组合与验证 | `runtime-flags.ts` 完整配置模式 |
| 08 | Layer 进阶 — 复杂依赖图 | 动态 Layer（`unwrap/effect`）；条件注入（`orDie/orElse`）；多层架构组织；测试中的 Layer 替换 | `instance-layer.ts` 动态加载 |
| 09 | Schema 进阶 — 复杂数据建模 | `Union/Literal/TemplateLiteral`；`transform` 数据转换；`extend/omit`；递归 Schema | LLM 事件 Schema 体系 |
| 10 | Effect 模式集锦 | `retry + Schedule` 重试策略；`timeout` 超时；`race/raceAll` 竞速；`forEach/all` 批量；`cached/once` 缓存 | 综合实战案例 |

### 第三部分：并发与流（第 11-14 章）

Effect-TS 区别于其他方案的核心优势，OpenCode 项目中最密集使用的进阶能力。

| 章节 | 主题 | 核心内容 | OpenCode 参考 |
|---|---|---|---|
| 11 | Fiber — 轻量级并发 | Fiber vs Promise 本质差异；`fork/join/interrupt`；生命周期与状态；结构化并发（Scope 内 Fiber 管理） | `runner.ts` Fiber 管理 |
| 12 | Stream — 响应式数据处理 | 创建/转换/消费操作；`runCollect/runForEach`；`merge/zip/concat`；背压（backpressure）机制 | `ripgrep.ts` 实时日志管道 |
| 13 | Queue 与 Deferred — 异步协调 | `bounded/unbounded/sliding/dropping` 队列；`offer/take` 操作；`Deferred` 一次性信号；生产者-消费者模式 | `mcp/index.ts` Queue 模式 |
| 14 | 高级并发原语 | `SynchronizedRef` 并发安全状态；`Latch` 门闩；`FiberMap` 命名管理；`ScopedCache` 作用域缓存；`PubSub` 发布订阅 | `control-plane/workspace.ts` FiberMap + Stream |

### 第四部分：进阶专题（第 15-18 章）

从"会用"到"精通"——深入原理、性能、内存和疑难问题处理。

| 章节 | 主题 | 核心内容 | OpenCode 参考 |
|---|---|---|---|
| 15 | 性能分析与优化 | Effect 运行时开销来源；Fiber 调度与线程模型；`cached` 缓存策略；避免不必要 `flatMap` 嵌套；Stream chunk 大小调优；基准测试方法 | 项目性能关键路径 |
| 16 | 内存管理 | Effect 闭包与内存引用；Scope 与资源释放时机；Fiber 泄漏检测与预防；Stream 缓冲内存控制；Layer 生命周期与内存占用；常见内存问题排查 | 长时间运行 Session 内存分析 |
| 17 | Effect-TS 实现原理 | Effect 类型内部结构；Fiber 运行时事件循环；Layer 依赖解析算法；Schema AST 与编译器；Stream pull-based 模型；与 ZIO（Scala）设计对比 | 源码级剖析 |
| 18 | 典型问题处理手册 | 长时间任务取消与清理；并发限制与速率控制；部分失败与优雅降级；跨服务事务一致性；调试技巧（`Cause.pretty`/trace/log）；常见反模式与替代方案 | 工具执行、MCP 连接等实际场景 |

### 第五部分：实战与总结（第 19-20 章）

从 OpenCode 真实代码中提炼可复用的设计模式，给出从 TypeScript 迁移的完整路径。

| 章节 | 主题 | 核心内容 | OpenCode 参考 |
|---|---|---|---|
| 19 | OpenCode 实战案例剖析 | Runtime 架构（`ManagedRuntime` + Layer 组合）；工具系统 Effect 封装模式；MCP 客户端 Stream + Queue 模式；文件监控 Fiber + Scope 模式；权限系统 Schema + Deferred 模式；提炼可复用设计模式 | `app-runtime.ts`、`tool/`、`mcp/`、`file/watcher.ts`、`permission/` |
| 20 | 迁移指南与生态展望 | 从纯 TS 项目逐步迁移策略；与 React/Node.js/Bun 集成；Effect 生态（`@effect/platform`、`@effect/cli`、`@effect/rpc`）；Effect 4.0 新特性与未来方向；学习资源与社区 | 迁移路线图 |

## 5. 示例代码规范

### 目录结构

```
docs/Effect-ts/
├── 2026-06-23-effect-ts-book-design.md   # 本设计文档
├── BOOK-OUTLINE.md                        # 全书大纲（待生成）
└── demos/
    ├── ch01-why-effect-ts/
    │   ├── package.json
    │   └── src/
    │       ├── 01-pain-points.ts          # TS 痛点演示
    │       ├── 02-first-effect.ts         # 第一个 Effect 程序
    │       └── 03-comparison.ts           # 方案对比
    ├── ch02-effect-basics/
    │   ├── package.json
    │   └── src/
    │       ├── 01-effect-types.ts
    │       ├── 02-pipe-and-flow.ts
    │       └── 03-generator-syntax.ts
    ├── ... (每章一个目录)
    └── ch20-migration-guide/
        ├── package.json
        └── src/
            └── 01-migration-strategy.ts
```

### 代码规范

- 每个 `package.json` 声明对 `effect` 的依赖（版本 4.0.0-beta.65）
- 每个 `.ts` 文件可独立运行：`bun run src/<file>.ts`
- 代码注释使用中文，变量/函数名使用英文
- 每个示例文件开头注释说明：学习目标、前置章节、运行方式
- 复杂示例拆分为多个文件，按序号命名（01-xxx.ts, 02-xxx.ts）
- 每个章节目录包含一个 `README.md` 说明本章示例的学习路径

## 6. 内容规范

### 每章结构

1. **本章目标**（~100 字）：学完能做什么
2. **前置知识**：依赖哪些前序章节
3. **概念讲解**（~40%）：从问题出发，引出概念，解释原理
4. **代码示例**（~40%）：概念 → 示例 → 逐行解析
5. **OpenCode 实战引用**（~10%）：展示项目中的真实用法
6. **常见陷阱**（~5%）：本章概念的易错点
7. **本章小结**（~5%）：关键要点回顾

### 术语规范

- 首次出现的 Effect-TS 术语保留英文原词并附中文翻译
- 后续章节统一使用英文术语（如 Layer、Fiber、Scope）
- TypeScript 原生概念使用中文（如"类型推断"、"泛型约束"）

## 7. 交付物

| 交付物 | 位置 | 说明 |
|---|---|---|
| 设计文档 | `docs/Effect-ts/2026-06-23-effect-ts-book-design.md` | 本文档 |
| 全书大纲 | `docs/Effect-ts/BOOK-OUTLINE.md` | 每章详细小节规划 |
| 章节内容 | `docs/Effect-ts/chapter-XX-<slug>.md` | 每章 Markdown 文件 |
| 示例代码 | `docs/Effect-ts/demos/chXX-<slug>/` | 每章独立可运行代码 |
| 实施计划 | 由 writing-plans 技能生成 | 逐章执行计划 |

## 8. 风险与约束

- **Effect 4.0 beta 版本**：API 可能在正式版有调整，需在书中标注版本号
- **OpenCode 代码演进**：引用的源码可能随项目更新而变化，示例代码独立维护不受影响
- **章节依赖链**：后期章节依赖前期概念，需按顺序编写，不可并行跳跃
- **中文技术术语**：Effect-TS 中文资料较少，术语翻译需保持一致

## 9. 自检清单

- [x] 无 TBD/TODO 占位符
- [x] 章节之间无矛盾（基础→核心→并发→进阶→实战，依赖链清晰）
- [x] 范围聚焦：20 章覆盖核心+并发，未扩展到 @effect/platform 等外围生态（仅在第 20 章简介）
- [x] 无歧义：每章主题、内容、参考源码均已明确
- [x] 示例代码规范明确（目录结构、运行方式、注释要求）
- [x] 内容规范明确（每章七段式结构、术语规范）

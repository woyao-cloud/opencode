# Effect-TS 实战指南 — 全书大纲

> 目标读者：具备 TypeScript 基础、准备在生产环境中采用 Effect-TS 的开发者
> Effect 版本：4.0.0-beta.65
> 全书共 5 部分、20 章

---

## 一、全书总览

| 部分 | 主题 | 章节 | 核心目标 |
|------|------|------|----------|
| **第一部分：基础入门** | 从痛点出发，建立 Effect-TS 心智模型 | 第 1-5 章 | 理解 Effect 类型、Schema、Context/Layer、错误处理 |
| **第二部分：资源与配置** | 生产级应用的资源管理与配置 | 第 6-8 章 | 掌握 Scope、Config、Layer 进阶 |
| **第三部分：模式与并发** | 常用模式与并发编程 | 第 9-14 章 | Schema 进阶、Effect 模式、Fiber、Stream、Queue、高级并发原语 |
| **第四部分：性能与原理** | 性能优化与内部实现 | 第 15-18 章 | 性能分析、内存管理、实现原理、问题处理手册 |
| **第五部分：实战与展望** | OpenCode 真实案例与迁移指南 | 第 19-20 章 | 实战案例剖析、迁移策略与生态展望 |

---

## 二、各章详细小节

### 第一部分：基础入门

#### 第 1 章: 为什么需要 Effect-TS？

- 1.1 TypeScript 异步编程的三大痛点
- 1.2 Effect-TS 的核心理念：副作用即数据类型
- 1.3 与其他方案对比（fp-ts, zod + 手工 DI）
- 1.4 本书学习路线图

#### 第 2 章: Effect 类型入门

- 2.1 Effect<R, E, A> 三参数模型详解
- 2.2 创建 Effect：succeed / fail / sync / try / promise
- 2.3 组合 Effect：pipe 与 flow
- 2.4 生成器语法：Effect.gen 与 yield*
- 2.5 运行 Effect：runSync / runPromise / runFork

#### 第 3 章: Schema — 运行时类型安全

- 3.1 为什么 TypeScript 类型在运行时"消失"了
- 3.2 Schema.Struct 基础数据建模
- 3.3 Schema.Class 与面向对象风格
- 3.4 Schema.Tag 与可扩展类型
- 3.5 encode / decode：序列化与反序列化
- 3.6 Schema 与 TypeScript 类型系统的双向推导

#### 第 4 章: Context 与 Layer — 依赖注入

- 4.1 依赖注入问题的本质
- 4.2 Context.Tag：声明服务接口
- 4.3 Layer：构建依赖图
- 4.4 Effect.provide / provideMerge：注入依赖
- 4.5 Layer 组合模式：merge / provide / flatMap

#### 第 5 章: 错误处理模型

- 5.1 Effect 的错误类型系统
- 5.2 catchTag / catchAll / catchSome 错误恢复
- 5.3 Cause 类型体系：Fail / Die / Interrupt / Sequential / Parallel
- 5.4 错误恢复策略：retry / fallback / orElse
- 5.5 与 try/catch 的思维模式对比

### 第二部分：资源与配置

#### 第 6 章: Scope — 资源生命周期管理

- 6.1 资源管理的挑战：打开就要关闭
- 6.2 Scope 概念：可取消的资源作用域
- 6.3 acquireRelease 模式
- 6.4 Scope.fork 子作用域
- 6.5 addFinalizer 清理钩子

#### 第 7 章: Config — 配置管理

- 7.1 配置管理的常见模式
- 7.2 Config.string / number / boolean 基础
- 7.3 withDefault / orElse / orDie 配置策略
- 7.4 ConfigProvider：从环境变量、文件加载
- 7.5 配置组合与验证

#### 第 8 章: Layer 进阶 — 复杂依赖图

- 8.1 动态 Layer：Layer.unwrap / Layer.effect
- 8.2 条件注入：Layer.orDie / Layer.orElse
- 8.3 多层架构中的 Layer 组织模式
- 8.4 测试中的 Layer 替换策略
- 8.5 Layer 内存管理与生命周期

### 第三部分：模式与并发

#### 第 9 章: Schema 进阶 — 复杂数据建模

- 9.1 Union / Literal / TemplateLiteral 联合类型
- 9.2 transform：数据转换与管道
- 9.3 extend / omit：类型继承与裁剪
- 9.4 递归 Schema 与自引用类型
- 9.5 Schema 组合实战：构建 API 类型体系

#### 第 10 章: Effect 模式集锦

- 10.1 retry + Schedule：重试策略组合
- 10.2 timeout：超时控制
- 10.3 race / raceAll：并发竞速
- 10.4 forEach / all：批量操作
- 10.5 cached / once：函数缓存

#### 第 11 章: Fiber — 轻量级并发

- 11.1 Fiber vs Promise：本质差异
- 11.2 fork / join / interrupt 基础操作
- 11.3 Fiber 生命周期与状态
- 11.4 结构化并发：Scope 内的 Fiber 管理
- 11.5 Fiber 错误传播与隔离

#### 第 12 章: Stream — 响应式数据处理

- 12.1 Stream 概念：pull-based 响应式模型
- 12.2 创建 Stream：fromIterable / fromEffect / fromQueue
- 12.3 转换操作：map / filter / tap / mapEffect
- 12.4 消费 Stream：runCollect / runForEach / runFold
- 12.5 合并与分流：merge / zip / concat / broadcast
- 12.6 背压（backpressure）机制详解

#### 第 13 章: Queue 与 Deferred — 异步协调

- 13.1 Queue 类型：bounded / unbounded / sliding / dropping
- 13.2 Queue 操作：offer / take / takeAll / poll
- 13.3 Deferred：一次性异步信号
- 13.4 生产者-消费者模式实战
- 13.5 Queue + Fiber 构建并发管道

#### 第 14 章: 高级并发原语

- 14.1 SynchronizedRef：并发安全的可变状态
- 14.2 Latch：并发门闩与同步点
- 14.3 FiberMap：命名 Fiber 集合管理
- 14.4 ScopedCache：作用域内缓存
- 14.5 PubSub：发布订阅模式

### 第四部分：性能与原理

#### 第 15 章: 性能分析与优化

- 15.1 Effect 运行时开销来源分析
- 15.2 Fiber 调度与事件循环
- 15.3 Effect.cached 缓存策略与命中率
- 15.4 避免不必要的 flatMap 嵌套
- 15.5 Stream chunk 大小调优
- 15.6 基准测试工具与方法

#### 第 16 章: 内存管理

- 16.1 Effect 闭包与内存引用链
- 16.2 Scope 与资源释放时机
- 16.3 Fiber 泄漏检测与预防
- 16.4 Stream 缓冲内存控制
- 16.5 Layer 生命周期与内存占用
- 16.6 常见内存问题排查清单

#### 第 17 章: Effect-TS 实现原理

- 17.1 Effect 类型的内部结构
- 17.2 Fiber 运行时的事件循环机制
- 17.3 Layer 的依赖解析算法
- 17.4 Schema 的 AST 与编译器
- 17.5 Stream 的 pull-based 实现
- 17.6 与 ZIO（Scala）的设计对比

#### 第 18 章: 典型问题处理手册

- 18.1 长时间运行任务的取消与清理
- 18.2 并发限制与速率控制
- 18.3 部分失败与优雅降级
- 18.4 跨服务事务一致性
- 18.5 调试技巧：Cause.pretty / trace / log
- 18.6 常见反模式与替代方案

### 第五部分：实战与展望

#### 第 19 章: OpenCode 实战案例剖析

- 19.1 Runtime 架构：ManagedRuntime + Layer.mergeAll
- 19.2 工具系统的 Effect 封装模式
- 19.3 MCP 客户端的 Stream + Queue 模式
- 19.4 文件监控的 Fiber + Scope 模式
- 19.5 权限系统的 Schema + Deferred 模式
- 19.6 可复用设计模式提炼

#### 第 20 章: 迁移指南与生态展望

- 20.1 从纯 TypeScript 项目逐步迁移策略
- 20.2 与 React / Node.js / Bun 的集成
- 20.3 Effect 生态：@effect/platform / @effect/cli / @effect/rpc
- 20.4 Effect 4.0 新特性与未来方向
- 20.5 学习资源与社区

---

## 三、全书术语表

> 约定：术语首次出现时保留英文原文并附中文翻译，后续章节仅使用英文术语。

| Effect-TS 术语 | 中文翻译 | 首次出现章节 |
|----------------|----------|--------------|
| Effect | 效应（副作用即数据类型） | 第 1 章 |
| Schema | 模式（运行时类型系统） | 第 3 章 |
| Context | 上下文（依赖注入容器） | 第 4 章 |
| Layer | 层（依赖构建与组合单元） | 第 4 章 |
| Scope | 作用域（可取消的资源生命周期） | 第 6 章 |
| Config | 配置（类型安全的配置管理） | 第 7 章 |
| Fiber | 纤程（轻量级并发单元） | 第 11 章 |
| Stream | 流（pull-based 响应式数据管道） | 第 12 章 |
| Queue | 队列（异步协调数据结构） | 第 13 章 |
| Deferred | 延迟承诺（一次性异步信号） | 第 13 章 |
| SynchronizedRef | 同步引用（并发安全的可变状态） | 第 14 章 |
| Latch | 门闩（并发同步点） | 第 14 章 |
| FiberMap | 纤程映射（命名 Fiber 集合） | 第 14 章 |
| ScopedCache | 作用域缓存（Scope 内缓存） | 第 14 章 |
| PubSub | 发布订阅（消息广播模式） | 第 14 章 |
| ManagedRuntime | 托管运行时（Layer 驱动的 Runtime） | 第 19 章 |
| Cause | 因果（错误原因类型体系） | 第 5 章 |
| Exit | 退出（成功/失败的结果封装） | 第 5 章 |
| Schedule | 调度（重试与重复策略） | 第 10 章 |
| pipe | 管道（函数组合操作符） | 第 2 章 |
| flow | 流式组合（预构建管道） | 第 2 章 |
| Effect.gen | 效应生成器（生成器语法糖） | 第 2 章 |
| yield* | 生成器产出（在 gen 中解包 Effect） | 第 2 章 |
| acquireRelease | 获取释放（资源安全获取与释放） | 第 6 章 |
| addFinalizer | 添加终结器（注册清理钩子） | 第 6 章 |
| ConfigProvider | 配置提供者（配置加载后端） | 第 7 章 |
| catchTag | 按标签捕获（按错误类型恢复） | 第 5 章 |
| catchAll | 全捕获（捕获所有错误） | 第 5 章 |
| orDie | 或死亡（将错误转为不可恢复缺陷） | 第 5 章 |
| orElse | 或替代（错误时切换到备用 Effect） | 第 5 章 |

---

## 四、章节依赖关系图

> 箭头方向：A → B 表示 B 依赖 A（即阅读 B 之前应先阅读 A）。

```
第 1 章（为什么需要 Effect-TS？）
  └→ 第 2 章（Effect 类型入门）
       ├→ 第 3 章（Schema — 运行时类型安全）
       │    └→ 第 9 章（Schema 进阶 — 复杂数据建模）
       │         └→ 第 19 章（OpenCode 实战案例剖析）
       ├→ 第 4 章（Context 与 Layer — 依赖注入）
       │    ├→ 第 7 章（Config — 配置管理）
       │    └→ 第 8 章（Layer 进阶 — 复杂依赖图）
       │         └→ 第 19 章（OpenCode 实战案例剖析）
       ├→ 第 5 章（错误处理模型）
       │    ├→ 第 10 章（Effect 模式集锦）
       │    │    └→ 第 18 章（典型问题处理手册）
       │    └→ 第 18 章（典型问题处理手册）
       ├→ 第 6 章（Scope — 资源生命周期管理）
       │    ├→ 第 11 章（Fiber — 轻量级并发）
       │    │    ├→ 第 13 章（Queue 与 Deferred — 异步协调）
       │    │    │    └→ 第 14 章（高级并发原语）
       │    │    │         └→ 第 19 章（OpenCode 实战案例剖析）
       │    │    ├→ 第 14 章（高级并发原语）
       │    │    ├→ 第 15 章（性能分析与优化）
       │    │    └→ 第 16 章（内存管理）
       │    ├→ 第 12 章（Stream — 响应式数据处理）
       │    │    ├→ 第 15 章（性能分析与优化）
       │    │    ├→ 第 16 章（内存管理）
       │    │    └→ 第 19 章（OpenCode 实战案例剖析）
       │    └→ 第 16 章（内存管理）
       └→ 第 17 章（Effect-TS 实现原理）
            └→ 第 20 章（迁移指南与生态展望）

第 19 章（OpenCode 实战案例剖析）依赖：第 3, 4, 8, 9, 11, 12, 13, 14 章
第 20 章（迁移指南与生态展望）依赖：第 17 章 + 全书所有章节
```

### 依赖关系速查表

| 章节 | 直接依赖的前序章节 |
|------|---------------------|
| 第 1 章 | 无（独立阅读） |
| 第 2 章 | 第 1 章 |
| 第 3 章 | 第 2 章 |
| 第 4 章 | 第 2 章 |
| 第 5 章 | 第 2 章 |
| 第 6 章 | 第 2 章 |
| 第 7 章 | 第 4 章 |
| 第 8 章 | 第 4 章 |
| 第 9 章 | 第 3 章 |
| 第 10 章 | 第 5 章 |
| 第 11 章 | 第 6 章 |
| 第 12 章 | 第 6 章 |
| 第 13 章 | 第 11 章 |
| 第 14 章 | 第 11, 13 章 |
| 第 15 章 | 第 11, 12 章 |
| 第 16 章 | 第 6, 11, 12 章 |
| 第 17 章 | 第 2 章 |
| 第 18 章 | 第 5, 10 章 |
| 第 19 章 | 第 3, 4, 8, 9, 11, 12, 13, 14 章 |
| 第 20 章 | 第 17 章 + 全书 |

---

## 五、每章结构规范

全书每章 Markdown 文件遵循统一的七段式结构：

1. **本章目标** — 明确本章学习完成后应掌握的技能
2. **前置知识** — 列出需要预先阅读的章节和概念
3. **概念讲解** — 核心概念的详细阐述
4. **代码示例** — 可独立运行的 demo 代码（`bun run src/<file>.ts`）
5. **OpenCode 实战引用** — 展示 OpenCode 项目中该概念的真实使用场景
6. **常见陷阱** — 新手容易犯的错误及解决方案
7. **本章小结** — 关键要点回顾

---

> 大纲版本：v1.0 | 创建日期：2026-06-23 | 对应 Effect 版本：4.0.0-beta.65

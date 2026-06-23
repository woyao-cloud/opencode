### Task 0: 项目脚手架与全书大纲

**Files:**
- Create: `docs/Effect-ts/BOOK-OUTLINE.md`
- Create: `docs/Effect-ts/demos/tsconfig.base.json`

**Interfaces:**
- Produces: `BOOK-OUTLINE.md` — 每章详细小节规划（3-5 个小节），全书术语表
- Produces: `tsconfig.base.json` — 所有 demo 共享的 TypeScript 配置

- [ ] **Step 1: 创建共享 tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "types": []
  },
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: 创建 BOOK-OUTLINE.md 全书大纲**

内容包含:
- 五部分 20 章的总览表
- 每章 3-5 个小节的详细标题
- 全书术语表（Effect-TS 术语 → 中文翻译 → 首次出现章节）
- 章节依赖关系图（哪些章依赖哪些前序章）

每章小节规划如下:

```
第 1 章: 为什么需要 Effect-TS？
  1.1 TypeScript 异步编程的三大痛点
  1.2 Effect-TS 的核心理念：副作用即数据类型
  1.3 与其他方案对比（fp-ts, zod + 手工 DI）
  1.4 本书学习路线图

第 2 章: Effect 类型入门
  2.1 Effect<R, E, A> 三参数模型详解
  2.2 创建 Effect：succeed / fail / sync / try / promise
  2.3 组合 Effect：pipe 与 flow
  2.4 生成器语法：Effect.gen 与 yield*
  2.5 运行 Effect：runSync / runPromise / runFork

第 3 章: Schema — 运行时类型安全
  3.1 为什么 TypeScript 类型在运行时"消失"了
  3.2 Schema.Struct 基础数据建模
  3.3 Schema.Class 与面向对象风格
  3.4 Schema.Tag 与可扩展类型
  3.5 encode / decode：序列化与反序列化
  3.6 Schema 与 TypeScript 类型系统的双向推导

第 4 章: Context 与 Layer — 依赖注入
  4.1 依赖注入问题的本质
  4.2 Context.Tag：声明服务接口
  4.3 Layer：构建依赖图
  4.4 Effect.provide / provideMerge：注入依赖
  4.5 Layer 组合模式：merge / provide / flatMap

第 5 章: 错误处理模型
  5.1 Effect 的错误类型系统
  5.2 catchTag / catchAll / catchSome 错误恢复
  5.3 Cause 类型体系：Fail / Die / Interrupt / Sequential / Parallel
  5.4 错误恢复策略：retry / fallback / orElse
  5.5 与 try/catch 的思维模式对比

第 6 章: Scope — 资源生命周期管理
  6.1 资源管理的挑战：打开就要关闭
  6.2 Scope 概念：可取消的资源作用域
  6.3 acquireRelease 模式
  6.4 Scope.fork 子作用域
  6.5 addFinalizer 清理钩子

第 7 章: Config — 配置管理
  7.1 配置管理的常见模式
  7.2 Config.string / number / boolean 基础
  7.3 withDefault / orElse / orDie 配置策略
  7.4 ConfigProvider：从环境变量、文件加载
  7.5 配置组合与验证

第 8 章: Layer 进阶 — 复杂依赖图
  8.1 动态 Layer：Layer.unwrap / Layer.effect
  8.2 条件注入：Layer.orDie / Layer.orElse
  8.3 多层架构中的 Layer 组织模式
  8.4 测试中的 Layer 替换策略
  8.5 Layer 内存管理与生命周期

第 9 章: Schema 进阶 — 复杂数据建模
  9.1 Union / Literal / TemplateLiteral 联合类型
  9.2 transform：数据转换与管道
  9.3 extend / omit：类型继承与裁剪
  9.4 递归 Schema 与自引用类型
  9.5 Schema 组合实战：构建 API 类型体系

第 10 章: Effect 模式集锦
  10.1 retry + Schedule：重试策略组合
  10.2 timeout：超时控制
  10.3 race / raceAll：并发竞速
  10.4 forEach / all：批量操作
  10.5 cached / once：函数缓存

第 11 章: Fiber — 轻量级并发
  11.1 Fiber vs Promise：本质差异
  11.2 fork / join / interrupt 基础操作
  11.3 Fiber 生命周期与状态
  11.4 结构化并发：Scope 内的 Fiber 管理
  11.5 Fiber 错误传播与隔离

第 12 章: Stream — 响应式数据处理
  12.1 Stream 概念：pull-based 响应式模型
  12.2 创建 Stream：fromIterable / fromEffect / fromQueue
  12.3 转换操作：map / filter / tap / mapEffect
  12.4 消费 Stream：runCollect / runForEach / runFold
  12.5 合并与分流：merge / zip / concat / broadcast
  12.6 背压（backpressure）机制详解

第 13 章: Queue 与 Deferred — 异步协调
  13.1 Queue 类型：bounded / unbounded / sliding / dropping
  13.2 Queue 操作：offer / take / takeAll / poll
  13.3 Deferred：一次性异步信号
  13.4 生产者-消费者模式实战
  13.5 Queue + Fiber 构建并发管道

第 14 章: 高级并发原语
  14.1 SynchronizedRef：并发安全的可变状态
  14.2 Latch：并发门闩与同步点
  14.3 FiberMap：命名 Fiber 集合管理
  14.4 ScopedCache：作用域内缓存
  14.5 PubSub：发布订阅模式

第 15 章: 性能分析与优化
  15.1 Effect 运行时开销来源分析
  15.2 Fiber 调度与事件循环
  15.3 Effect.cached 缓存策略与命中率
  15.4 避免不必要的 flatMap 嵌套
  15.5 Stream chunk 大小调优
  15.6 基准测试工具与方法

第 16 章: 内存管理
  16.1 Effect 闭包与内存引用链
  16.2 Scope 与资源释放时机
  16.3 Fiber 泄漏检测与预防
  16.4 Stream 缓冲内存控制
  16.5 Layer 生命周期与内存占用
  16.6 常见内存问题排查清单

第 17 章: Effect-TS 实现原理
  17.1 Effect 类型的内部结构
  17.2 Fiber 运行时的事件循环机制
  17.3 Layer 的依赖解析算法
  17.4 Schema 的 AST 与编译器
  17.5 Stream 的 pull-based 实现
  17.6 与 ZIO（Scala）的设计对比

第 18 章: 典型问题处理手册
  18.1 长时间运行任务的取消与清理
  18.2 并发限制与速率控制
  18.3 部分失败与优雅降级
  18.4 跨服务事务一致性
  18.5 调试技巧：Cause.pretty / trace / log
  18.6 常见反模式与替代方案

第 19 章: OpenCode 实战案例剖析
  19.1 Runtime 架构：ManagedRuntime + Layer.mergeAll
  19.2 工具系统的 Effect 封装模式
  19.3 MCP 客户端的 Stream + Queue 模式
  19.4 文件监控的 Fiber + Scope 模式
  19.5 权限系统的 Schema + Deferred 模式
  19.6 可复用设计模式提炼

第 20 章: 迁移指南与生态展望
  20.1 从纯 TypeScript 项目逐步迁移策略
  20.2 与 React / Node.js / Bun 的集成
  20.3 Effect 生态：@effect/platform / @effect/cli / @effect/rpc
  20.4 Effect 4.0 新特性与未来方向
  20.5 学习资源与社区
```

- [ ] **Step 3: 验证大纲完整性**

检查: 每章 3-6 个小节，术语表覆盖所有核心概念，依赖关系图正确

- [ ] **Step 4: 提交**

```bash
git add docs/Effect-ts/BOOK-OUTLINE.md docs/Effect-ts/demos/tsconfig.base.json
git commit -m "docs: Effect-TS book outline and shared tsconfig"
```

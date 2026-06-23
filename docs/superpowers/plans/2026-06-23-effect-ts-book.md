# Effect-TS 深入讲解书籍 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 编写一本 20 章、五部分的 Effect-TS 深入讲解中文书籍，每章包含 Markdown 内容 + 独立可运行的 TypeScript 示例代码。

**Architecture:** 渐进式结构（基础→核心→并发→进阶→实战），每章独立目录含 package.json + 示例 .ts 文件，参考 OpenCode 项目真实源码模式。全书 Markdown 文件 + demos 代码共存于 `docs/Effect-ts/`。

**Tech Stack:** Bun (运行时), Effect 4.0.0-beta.65, TypeScript, Markdown

## Global Constraints

- Effect 版本锁定: `4.0.0-beta.65`（对齐 OpenCode 项目 catalog）
- 每个 demo 的 package.json 必须声明 `"effect": "4.0.0-beta.65"`
- 每个 `.ts` 示例文件可独立运行: `bun run src/<file>.ts`
- 代码注释使用中文，变量/函数名使用英文
- 每章 Markdown 遵循七段式结构: 本章目标 → 前置知识 → 概念讲解 → 代码示例 → OpenCode 实战引用 → 常见陷阱 → 本章小结
- 术语规范: 首次出现的 Effect-TS 术语保留英文+中文翻译，后续统一使用英文术语
- 每章 demos 目录包含 README.md 说明学习路径
- 章节按顺序编写（后期章节依赖前期概念）

---

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

---

### Task 1: 第 1 章 — 为什么需要 Effect-TS？

**Files:**
- Create: `docs/Effect-ts/chapter-01-why-effect-ts.md`
- Create: `docs/Effect-ts/demos/ch01-why-effect-ts/package.json`
- Create: `docs/Effect-ts/demos/ch01-why-effect-ts/README.md`
- Create: `docs/Effect-ts/demos/ch01-why-effect-ts/src/01-pain-points.ts`
- Create: `docs/Effect-ts/demos/ch01-why-effect-ts/src/02-first-effect.ts`
- Create: `docs/Effect-ts/demos/ch01-why-effect-ts/src/03-comparison.ts`

**Interfaces:**
- Consumes: `tsconfig.base.json` (extends in tsconfig)
- Produces: 第 1 章完整内容 + 3 个可运行示例

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch01-why-effect-ts",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:pain-points": "bun run src/01-pain-points.ts",
    "demo:first-effect": "bun run src/02-first-effect.ts",
    "demo:comparison": "bun run src/03-comparison.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2: 编写 01-pain-points.ts — TS 异步编程痛点演示**

演示三个痛点场景:
1. Promise 错误吞没: `fetch` 失败时错误信息丢失，无法区分网络错误 vs 业务错误
2. 依赖注入靠手工: 全局变量/单例模式的测试困难
3. 副作用不可控: 日志、文件操作混在业务逻辑中

```typescript
/**
 * 01-pain-points.ts — TypeScript 异步编程的三大痛点
 *
 * 学习目标: 通过三个真实场景，理解为什么需要 Effect-TS
 * 前置章节: 无
 * 运行方式: bun run src/01-pain-points.ts
 *
 * 痛点 1: Promise 错误处理不完整
 * 痛点 2: 依赖注入靠手工管理
 * 痛点 3: 副作用与业务逻辑耦合
 */

// ========== 痛点 1: Promise 错误处理不完整 ==========

// 模拟一个可能失败的 API 调用
async function fetchUserData(id: string): Promise<{ name: string; email: string }> {
  if (id === "error") {
    throw new Error("Network error: Connection refused")
  }
  if (id === "not-found") {
    throw new Error("User not found")
  }
  return { name: "Alice", email: "alice@example.com" }
}

// 问题: 调用者无法从类型签名知道可能发生什么错误
// Promise<{name, email}> 看起来总是成功的，但实际可能抛出各种错误
async function demo1() {
  try {
    const user = await fetchUserData("error")
    console.log("用户:", user)
  } catch (err) {
    // err 是 unknown 类型，无法区分错误类型
    console.log("出了点问题:", String(err))
  }
}

// ========== 痛点 2: 依赖注入靠手工管理 ==========

// 传统方式: 全局单例或手工传递
class Database {
  private static instance: Database
  static getInstance() {
    if (!this.instance) this.instance = new Database()
    return this.instance
  }
  async query(sql: string): Promise<any[]> {
    console.log(`执行查询: ${sql}`)
    return []
  }
}

class UserService {
  // 硬编码依赖 Database.getInstance() — 无法在测试中替换
  async getUsers() {
    const db = Database.getInstance()
    return db.query("SELECT * FROM users")
  }
}

// ========== 痛点 3: 副作用与业务逻辑耦合 ==========

async function processOrder(orderId: string) {
  console.log(`[INFO] 开始处理订单 ${orderId}`) // 副作用: 日志
  const startTime = Date.now()                  // 副作用: 时间

  // 业务逻辑和副作用混在一起
  const result = await fetch(`/api/orders/${orderId}`)
  const data = await result.json()

  console.log(`[INFO] 订单处理完成，耗时 ${Date.now() - startTime}ms`)
  return data
}

// 运行所有演示
async function main() {
  console.log("=== 痛点 1: Promise 错误处理 ===\n")
  await demo1()

  console.log("\n=== 痛点 2: 依赖注入 ===\n")
  const svc = new UserService()
  await svc.getUsers()

  console.log("\n=== 痛点 3: 副作用耦合 ===\n")
  // 不实际调用 fetch，仅展示代码结构
  console.log("（代码结构展示：副作用与业务逻辑混在一起）")
}

main()
```

- [ ] **Step 3: 编写 02-first-effect.ts — 第一个 Effect 程序**

展示 Effect 如何解决痛点 1（错误类型化）:

```typescript
/**
 * 02-first-effect.ts — 第一个 Effect 程序
 *
 * 学习目标: 用 Effect 重写痛点 1 的场景，体验类型安全的错误处理
 * 前置章节: 01-pain-points.ts
 * 运行方式: bun run src/02-first-effect.ts
 */

import { Effect, Schema } from "effect"

// 用 Schema.TaggedErrorClass 定义类型化的错误
class NetworkError extends Schema.TaggedErrorClass<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("NotFoundError", {
  id: Schema.String,
}) {}

// Effect<R, E, A> = Effect<Requirements, Error, Value>
// 错误类型出现在签名中！
const fetchUserData = (id: string): Effect.Effect<never, NetworkError | NotFoundError, { name: string; email: string }> =>
  id === "error"
    ? Effect.fail(new NetworkError({ message: "Connection refused" }))
    : id === "not-found"
      ? Effect.fail(new NotFoundError({ id }))
      : Effect.succeed({ name: "Alice", email: "alice@example.com" })

const program = Effect.gen(function* () {
  // yield* 类似 await，但错误类型被跟踪
  const user = yield* fetchUserData("alice")
  console.log("用户:", user)
})

// 运行: 成功场景
Effect.runSync(program)
```

- [ ] **Step 4: 编写 03-comparison.ts — 方案对比**

对比 Effect-TS 与 fp-ts、zod + 手工 DI 在同一个场景下的代码差异:

```typescript
/**
 * 03-comparison.ts — Effect-TS 与其他方案对比
 *
 * 学习目标: 理解 Effect-TS 的一体化优势 vs 组合多个库的方案
 * 前置章节: 02-first-effect.ts
 * 运行方式: bun run src/03-comparison.ts
 *
 * 场景: 读取配置 → 调用 API → 校验响应 → 存入数据库
 * 对比: 纯 TS / zod+手工DI / Effect-TS
 */

import { Effect, Schema, Context, Layer } from "effect"

// ===== 方案 A: 纯 TypeScript (仅展示结构) =====
// 问题: 错误类型丢失、依赖手工管理、校验与类型分离

// ===== 方案 B: zod + 手工 DI (仅展示结构) =====
// 问题: 校验和类型需要维护两份、DI 无标准方案

// ===== 方案 C: Effect-TS 一体化 =====

// Schema 同时提供类型和校验
const Config = Schema.Struct({
  apiUrl: Schema.String,
  timeout: Schema.Number.pipe(Schema.positive()),
})
type Config = typeof Config.Type // 类型自动推导

// Context + Layer 提供标准化 DI
class ApiService extends Context.Tag("ApiService")<
  ApiService,
  { fetch(): Effect.Effect<never, Error, string> }
>() {}

// 完整流程: 类型安全、错误可追踪、依赖可替换
const program = Effect.gen(function* () {
  const api = yield* ApiService
  const result = yield* api.fetch()
  return result
})

console.log("方案对比代码结构展示完成")
console.log("Effect-TS 优势: 类型+校验统一、DI 标准化、错误类型化")
```

- [ ] **Step 5: 创建 README.md**

说明本章 3 个示例的学习顺序和目标

- [ ] **Step 6: 编写 chapter-01-why-effect-ts.md**

按七段式结构:
1. 本章目标: 理解 Effect-TS 解决什么问题，建立初步认知
2. 前置知识: TypeScript 基础（Promise、async/await、try/catch）
3. 概念讲解: 三大痛点深入分析 → Effect 核心理念 → 方案对比
4. 代码示例: 引用 demos 中的 3 个文件，逐段解析
5. OpenCode 实战引用: 本章为基础章，无具体引用
6. 常见陷阱: 误以为 Effect 只是"更好的 Promise"
7. 本章小结: Effect 将副作用建模为类型 → 错误可追踪、依赖可注入、副作用可控

- [ ] **Step 7: 验证所有示例可运行**

```bash
cd docs/Effect-ts/demos/ch01-why-effect-ts
bun install
bun run src/01-pain-points.ts  # 预期: 输出痛点演示
bun run src/02-first-effect.ts  # 预期: 输出 "用户: { name: 'Alice', email: 'alice@example.com' }"
bun run src/03-comparison.ts   # 预期: 输出方案对比说明
```

- [ ] **Step 8: 提交**

```bash
git add docs/Effect-ts/chapter-01-why-effect-ts.md docs/Effect-ts/demos/ch01-why-effect-ts/
git commit -m "docs: Effect-TS book chapter 1 - Why Effect-TS"
```

---

### Task 2: 第 2 章 — Effect 类型入门

**Files:**
- Create: `docs/Effect-ts/chapter-02-effect-basics.md`
- Create: `docs/Effect-ts/demos/ch02-effect-basics/package.json`
- Create: `docs/Effect-ts/demos/ch02-effect-basics/README.md`
- Create: `docs/Effect-ts/demos/ch02-effect-basics/src/01-effect-types.ts`
- Create: `docs/Effect-ts/demos/ch02-effect-basics/src/02-pipe-and-flow.ts`
- Create: `docs/Effect-ts/demos/ch02-effect-basics/src/03-generator-syntax.ts`
- Create: `docs/Effect-ts/demos/ch02-effect-basics/src/04-running-effects.ts`

**Interfaces:**
- Consumes: 第 1 章基础概念
- Produces: Effect 类型完整入门 + 4 个可运行示例

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch02-effect-basics",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:types": "bun run src/01-effect-types.ts",
    "demo:pipe": "bun run src/02-pipe-and-flow.ts",
    "demo:gen": "bun run src/03-generator-syntax.ts",
    "demo:run": "bun run src/04-running-effects.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2: 编写 01-effect-types.ts — Effect<R, E, A> 三参数模型**

演示:
- `Effect.succeed<A>(value)` — 总是成功，R=never, E=never
- `Effect.fail<E>(error)` — 总是失败，R=never, A=never
- `Effect.sync(() => value)` — 同步可能抛异常
- `Effect.try(() => value)` — 同步抛异常 → 自动转为 fail
- `Effect.tryPromise(() => promise)` — Promise → Effect
- `Effect.promise(() => promise)` — Promise → Effect（不捕获异常）
- 类型参数如何随操作变化

- [ ] **Step 3: 编写 02-pipe-and-flow.ts — pipe 与 flow 组合**

演示:
- `pipe(value, fn1, fn2, fn3)` — 管道组合
- `flow(fn1, fn2, fn3)` — 创建组合函数
- `Effect.map` / `Effect.flatMap` / `Effect.tap` — Effect 变换
- `Effect.andThen` — 顺序组合
- 类型如何在管道中传递

- [ ] **Step 4: 编写 03-generator-syntax.ts — Effect.gen 与 yield***

演示:
- `Effect.gen(function* () { ... })` 基本语法
- `yield* effect` — 解包 Effect 获取值
- `yield* Effect.all([e1, e2])` — 并发执行
- `yield* Effect.forEach(items, fn)` — 批量处理
- 与 async/await 的语法对比
- 错误在 gen 中的传播方式

- [ ] **Step 5: 编写 04-running-effects.ts — 运行 Effect**

演示:
- `Effect.runSync(effect)` — 同步运行（需要 R=never）
- `Effect.runPromise(effect)` — 返回 Promise
- `Effect.runFork(effect)` — 返回 Fiber（异步不阻塞）
- `Effect.runPromiseExit(effect)` — 返回 Exit（不抛异常）
- 各运行方式的适用场景

- [ ] **Step 6: 编写 chapter-02-effect-basics.md**

按七段式结构，重点:
- 概念讲解: 三参数模型的直觉理解（R=依赖、E=可恢复错误、A=成功值）
- 代码示例: 引用 4 个 demo 文件
- 常见陷阱: 混淆 `Effect.tryPromise` 和 `Effect.promise`；在 gen 中用 `await` 而非 `yield*`

- [ ] **Step 7: 验证所有示例可运行**

```bash
cd docs/Effect-ts/demos/ch02-effect-basics && bun install
bun run src/01-effect-types.ts
bun run src/02-pipe-and-flow.ts
bun run src/03-generator-syntax.ts
bun run src/04-running-effects.ts
```

- [ ] **Step 8: 提交**

---

### Task 3: 第 3 章 — Schema 运行时类型安全

**Files:**
- Create: `docs/Effect-ts/chapter-03-schema.md`
- Create: `docs/Effect-ts/demos/ch03-schema/package.json`
- Create: `docs/Effect-ts/demos/ch03-schema/README.md`
- Create: `docs/Effect-ts/demos/ch03-schema/src/01-basic-struct.ts`
- Create: `docs/Effect-ts/demos/ch03-schema/src/02-class-and-tag.ts`
- Create: `docs/Effect-ts/demos/ch03-schema/src/03-encode-decode.ts`
- Create: `docs/Effect-ts/demos/ch03-schema/src/04-type-inference.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础
- Produces: Schema 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/llm/src/schema/events.ts` — `Usage` Schema.Class 模式

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-basic-struct.ts — Schema.Struct 基础**

演示:
- `Schema.Struct({ field: Schema.String })` 基础结构
- `Schema.Number`, `Schema.Boolean`, `Schema.Literal`
- `Schema.optional`, `Schema.Array`, `Schema.Record`
- `Schema.positive()`, `Schema.minLength(n)` 约束
- `Schema.decodeSync` / `Schema.decodeUnknownSync` 校验
- 校验失败时的错误信息

- [ ] **Step 3: 编写 02-class-and-tag.ts — Schema.Class 与 Schema.Tag**

演示:
- `Schema.Class<ClassName>()("ClassName")({ ... })` 类风格定义
- `Schema.TaggedErrorClass` — 带 tag 的错误类（参考 OpenCode Usage 模式）
- `Schema.TaggedStruct` — 带 tag 的结构体
- 类的实例化与方法定义
- 与普通 class + decorator 的对比

- [ ] **Step 4: 编写 03-encode-decode.ts — 序列化与反序列化**

演示:
- `Schema.encode` / `Schema.decode` — Effect 版本的编解码
- `Schema.encodeSync` / `Schema.decodeSync` — 同步版本
- `Schema.decodeUnknown` — 从 unknown 类型解码
- JSON 序列化往返（JSON → decode → 类型安全对象 → encode → JSON）
- 自定义 transform 进行数据清洗

- [ ] **Step 5: 编写 04-type-inference.ts — Schema 与 TS 类型双向推导**

演示:
- `typeof schema.Type` — Schema → TypeScript 类型
- `typeof schema.Encoded` — Schema → 编码类型
- `Schema.standardSchemaV1` — 与 Standard Schema 规范兼容
- Schema 作为"单一真相源"：类型定义 + 校验规则一处维护

- [ ] **Step 6: 编写 chapter-03-schema.md**

重点:
- 概念讲解: TypeScript 类型在编译后消失 → Schema 提供运行时保障
- OpenCode 实战引用: `llm/src/schema/events.ts` 的 `Usage` 类 — `Schema.Class` + `get visibleOutputTokens()`
- 常见陷阱: 混淆 `.Type` 和 `.Encoded`；忘记 Schema 校验是运行时操作

- [ ] **Step 7: 验证 + 提交**

---

### Task 4: 第 4 章 — Context 与 Layer 依赖注入

**Files:**
- Create: `docs/Effect-ts/chapter-04-context-layer.md`
- Create: `docs/Effect-ts/demos/ch04-context-layer/package.json`
- Create: `docs/Effect-ts/demos/ch04-context-layer/README.md`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/01-context-tag.ts`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/02-layer-basics.ts`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/03-provide-patterns.ts`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/04-layer-composition.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础
- Produces: Context + Layer 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/effect/runtime-flags.ts` — `Context.Tag` + `Layer` 模式

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-context-tag.ts — Context.Tag 声明服务接口**

演示:
- `Context.Tag<ServiceType>()("ServiceName")` 声明服务
- `Context.GenericTag<InterfaceType>()("ServiceName")` 泛型 Tag
- `Effect.gen` 中 `yield* ServiceTag` 获取服务实例
- 无 Layer 提供时运行报错（展示 MissingService 错误）

- [ ] **Step 3: 编写 02-layer-basics.ts — Layer 构建依赖图**

演示:
- `Layer.succeed(tag, instance)` — 提供固定值
- `Layer.sync(tag, () => instance)` — 同步构建
- `Layer.effect(tag, Effect.gen(...))` — 异步构建
- `Layer.scoped(tag, Effect.acquireRelease(...))` — 带资源管理的构建
- `Layer.provide(layer, dependency)` — 满足 Layer 的依赖

- [ ] **Step 4: 编写 03-provide-patterns.ts — Effect.provide 注入模式**

演示:
- `Effect.provide(effect, layer)` — 基础注入
- `Effect.provideService(effect, tag, instance)` — 直接提供实例
- `Effect.provideServiceEffect(effect, tag, Effect)` — 异步提供
- `Layer.provideMerge` — 合并 Layer
- 注入范围: 局部 provide vs 全局 Layer

- [ ] **Step 5: 编写 04-layer-composition.ts — Layer 组合模式**

演示:
- `Layer.merge(layerA, layerB)` — 合并两个独立 Layer
- `Layer.provide(layer, dependency)` — 满足依赖
- `Layer.flatMap` — 动态构建依赖链
- 构建一个三层依赖的服务体系: Config → Database → UserService

- [ ] **Step 6: 编写 chapter-04-context-layer.md**

重点:
- 概念讲解: DI 的本质是"声明需要什么"而非"自己去拿"
- OpenCode 实战引用: `runtime-flags.ts` — `Service extends ConfigService.Service<Service>()` 模式
- 常见陷阱: 忘记 `Layer.provide` 导致 MissingService；Layer 顺序错误

- [ ] **Step 7: 验证 + 提交**

---

### Task 5: 第 5 章 — 错误处理模型

**Files:**
- Create: `docs/Effect-ts/chapter-05-error-handling.md`
- Create: `docs/Effect-ts/demos/ch05-error-handling/package.json`
- Create: `docs/Effect-ts/demos/ch05-error-handling/README.md`
- Create: `docs/Effect-ts/demos/ch05-error-handling/src/01-catch-patterns.ts`
- Create: `docs/Effect-ts/demos/ch05-error-handling/src/02-cause-types.ts`
- Create: `docs/Effect-ts/demos/ch05-error-handling/src/03-recovery-strategies.ts`
- Create: `docs/Effect-ts/demos/ch05-error-handling/src/04-vs-try-catch.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 3 章 Schema（TaggedErrorClass）
- Produces: 错误处理完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/effect/promise.ts` — Cause 处理模式

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-catch-patterns.ts — catchTag / catchAll / catchSome**

演示:
- `Effect.catchTag(tag, handler)` — 按错误类型捕获
- `Effect.catchAll(handler)` — 捕获所有错误
- `Effect.catchSome(partialHandler)` — 选择性捕获
- `Effect.catchTag` 的多 tag 重载
- 错误处理后类型签名的变化

- [ ] **Step 3: 编写 02-cause-types.ts — Cause 类型体系**

演示:
- `Cause.Fail` — 预期的业务错误
- `Cause.Die` — 非预期的缺陷（bug）
- `Cause.Interrupt` — Fiber 被中断
- `Cause.Sequential` — 顺序错误组合
- `Cause.Parallel` — 并发错误组合
- `Cause.pretty` — 格式化错误信息
- `Cause.find` — 在 Cause 树中查找特定错误

- [ ] **Step 4: 编写 03-recovery-strategies.ts — 错误恢复策略**

演示:
- `Effect.retry({ times: 3 })` — 简单重试
- `Effect.retry(schedule)` — 使用 Schedule 控制重试
- `Effect.orElse(fallback)` — 失败时降级
- `Effect.orElseSucceed(defaultValue)` — 失败时返回默认值
- `Effect.either` — 将错误转为 Either 类型
- `Effect.option` — 将错误转为 Option 类型

- [ ] **Step 5: 编写 04-vs-try-catch.ts — 与 try/catch 思维对比**

演示:
- try/catch: 错误类型是 unknown，需要 instanceof 判断
- Effect: 错误类型在签名中，编译器强制处理
- try/catch: 无法强制调用者处理错误
- Effect: 不处理错误类型就无法运行（类型安全）
- 同一个场景两种写法的并排对比

- [ ] **Step 6: 编写 chapter-05-error-handling.md**

重点:
- 概念讲解: Effect 的错误模型 = 类型化 + 可恢复 + 可组合
- OpenCode 实战引用: `effect/promise.ts` 的 Cause 处理
- 常见陷阱: 过度使用 catchAll 吞没重要错误；忘记 Interrupt 也是一种错误

- [ ] **Step 7: 验证 + 提交**

---

### Task 6: 第 6 章 — Scope 资源生命周期管理

**Files:**
- Create: `docs/Effect-ts/chapter-06-scope.md`
- Create: `docs/Effect-ts/demos/ch06-scope/package.json`
- Create: `docs/Effect-ts/demos/ch06-scope/README.md`
- Create: `docs/Effect-ts/demos/ch06-scope/src/01-acquire-release.ts`
- Create: `docs/Effect-ts/demos/ch06-scope/src/02-scope-fork.ts`
- Create: `docs/Effect-ts/demos/ch06-scope/src/03-finalizer.ts`
- Create: `docs/Effect-ts/demos/ch06-scope/src/04-file-handle-demo.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 4 章 Layer
- Produces: Scope 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/file/index.ts` — 文件句柄 Scope 管理

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-acquire-release.ts — acquireRelease 模式**

演示:
- `Effect.acquireRelease(acquire, release)` — 获取+释放配对
- 模拟数据库连接: acquire 打开连接, release 关闭连接
- 成功路径: 使用后自动释放
- 失败路径: 即使中间操作失败，release 仍被执行
- 与 `try/finally` 的对比

- [ ] **Step 3: 编写 02-scope-fork.ts — Scope.fork 子作用域**

演示:
- `Scope.fork(parent, childPolicy)` — 创建子作用域
- 子 Scope 独立生命周期
- 父 Scope 关闭时子 Scope 自动关闭
- 子 Scope 提前关闭不影响父 Scope

- [ ] **Step 4: 编写 03-finalizer.ts — addFinalizer 清理钩子**

演示:
- `Effect.addFinalizer(() => Effect.sync(() => cleanup))` — 添加清理钩子
- 多个 finalizer 的执行顺序（LIFO）
- finalizer 在错误路径下的执行保证
- finalizer 本身失败的处理

- [ ] **Step 5: 编写 04-file-handle-demo.ts — 文件句柄管理实战**

演示:
- 模拟文件操作: 打开 → 读取 → 写入 → 关闭
- 使用 Scope 确保文件句柄在任何情况下都被关闭
- 多个文件操作的 Scope 管理
- 参考 OpenCode `file/index.ts` 的模式

- [ ] **Step 6: 编写 chapter-06-scope.md**

重点:
- 概念讲解: Scope 是"可取消的资源作用域"，比 try/finally 更强大
- OpenCode 实战引用: `file/index.ts` 的文件句柄 Scope 管理
- 常见陷阱: 忘记 Scope 导致资源泄漏；在 Scope 外使用 scoped 资源

- [ ] **Step 7: 验证 + 提交**

---

### Task 7: 第 7 章 — Config 配置管理

**Files:**
- Create: `docs/Effect-ts/chapter-07-config.md`
- Create: `docs/Effect-ts/demos/ch07-config/package.json`
- Create: `docs/Effect-ts/demos/ch07-config/README.md`
- Create: `docs/Effect-ts/demos/ch07-config/src/01-basic-config.ts`
- Create: `docs/Effect-ts/demos/ch07-config/src/02-provider.ts`
- Create: `docs/Effect-ts/demos/ch07-config/src/03-composition.ts`
- Create: `docs/Effect-ts/demos/ch07-config/src/04-runtime-flags-pattern.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 4 章 Layer
- Produces: Config 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/effect/runtime-flags.ts` — 完整 Config + Layer 模式

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-basic-config.ts — Config 基础**

演示:
- `Config.string(name)` / `Config.number(name)` / `Config.boolean(name)`
- `Config.withDefault(value)` — 默认值
- `Config.orElse(alternative)` — 备选配置
- `Config.map(fn)` — 值转换
- `Config.validate(condition)` — 值校验
- `Effect.gen` 中 `yield* Config.string("KEY")` 获取配置

- [ ] **Step 3: 编写 02-provider.ts — ConfigProvider 多源加载**

演示:
- `ConfigProvider.fromMap(map)` — 从 Map 加载
- `ConfigProvider.fromJson(json)` — 从 JSON 加载
- `ConfigProvider.layer(provider)` — 转为 Layer
- `ConfigProvider.fromEnv()` — 从环境变量加载
- 多 Provider 组合与优先级

- [ ] **Step 4: 编写 03-composition.ts — 配置组合与验证**

演示:
- `Config.all({ a: Config.string("A"), b: Config.number("B") })` — 组合多个配置
- `Config.zip(left, right)` — 配对组合
- `Config.redacted(name)` — 敏感配置脱敏
- 配置验证失败时的错误信息

- [ ] **Step 5: 编写 04-runtime-flags-pattern.ts — OpenCode RuntimeFlags 模式**

演示:
- 参考 `runtime-flags.ts` 的完整模式:
  - `ConfigService.Service` 子类声明所有配置项
  - `ConfigProvider.layer(ConfigProvider.fromUnknown({}))` 空配置层
  - `Layer.orDie` 确保配置缺失时快速失败
  - `layer(overrides)` 函数支持测试覆盖
- 构建一个简化版的 RuntimeFlags 服务

- [ ] **Step 6: 编写 chapter-07-config.md**

重点:
- 概念讲解: Config 是"类型安全的配置读取"，不是简单的 env var 包装
- OpenCode 实战引用: `runtime-flags.ts` 完整模式逐行解析
- 常见陷阱: 忘记提供 ConfigProvider 导致 MissingConfig；敏感配置未脱敏

- [ ] **Step 7: 验证 + 提交**

---

### Task 8: 第 8 章 — Layer 进阶：复杂依赖图

**Files:**
- Create: `docs/Effect-ts/chapter-08-layer-advanced.md`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/package.json`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/README.md`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/01-dynamic-layer.ts`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/02-conditional.ts`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/03-multi-layer-arch.ts`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/04-test-replacement.ts`

**Interfaces:**
- Consumes: 第 4 章 Layer 基础, 第 7 章 Config
- Produces: Layer 进阶 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/project/instance-layer.ts` — `Layer.unwrap` 动态加载

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-dynamic-layer.ts — 动态 Layer**

演示:
- `Layer.unwrap(Effect)` — 运行时决定返回哪个 Layer
- `Layer.effect(tag, Effect.gen(...))` — 异步构建服务
- `Layer.fresh(tag, factory)` — 每次使用创建新实例
- 参考 `instance-layer.ts` 的 `Layer.unwrap(Effect.promise(...))` 模式

- [ ] **Step 3: 编写 02-conditional.ts — 条件注入**

演示:
- `Layer.orDie` — 依赖缺失时立即终止
- `Layer.orElse(fallback)` — 依赖缺失时使用备选
- `Layer.provideMerge` — 合并多个 Layer
- 条件选择 Layer 的模式

- [ ] **Step 4: 编写 03-multi-layer-arch.ts — 多层架构组织**

演示:
- 构建一个三层架构: Infrastructure → Domain → Application
- 每层独立 Layer，通过 `Layer.provide` 连接
- `Layer.mergeAll(...)` 合并所有 Layer（参考 `app-runtime.ts` 模式）
- 大型项目的 Layer 组织最佳实践

- [ ] **Step 5: 编写 04-test-replacement.ts — 测试中的 Layer 替换**

演示:
- 生产 Layer vs 测试 Layer
- `Layer.succeed(tag, mock)` — 用 mock 替换真实服务
- `Effect.provideServiceEffect` — 局部替换
- 不修改业务代码即可切换依赖

- [ ] **Step 6: 编写 chapter-08-layer-advanced.md**

重点:
- 概念讲解: Layer 是"依赖图"，不是简单的 DI 容器
- OpenCode 实战引用: `instance-layer.ts` 动态加载 + `app-runtime.ts` `Layer.mergeAll`
- 常见陷阱: Layer 循环依赖；忘记 `Layer.orDie` 导致模糊的 MissingService 错误

- [ ] **Step 7: 验证 + 提交**

---

### Task 9: 第 9 章 — Schema 进阶：复杂数据建模

**Files:**
- Create: `docs/Effect-ts/chapter-09-schema-advanced.md`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/package.json`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/README.md`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/01-union-literal.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/02-transform.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/03-extend-omit.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/04-recursive.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/05-api-types.ts`

**Interfaces:**
- Consumes: 第 3 章 Schema 基础
- Produces: Schema 进阶 + 5 个可运行示例
- OpenCode 参考: `packages/llm/src/schema/events.ts` — LLM 事件 Schema 体系

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-union-literal.ts — Union / Literal / TemplateLiteral**

演示:
- `Schema.Union(memberA, memberB)` — 联合类型
- `Schema.Literal("value1", "value2")` — 字面量类型
- `Schema.TemplateLiteral` — 模板字面量类型
- `Schema.keyof` — 从对象提取 key 的联合类型
- 带 tag 的联合类型（discriminated union）

- [ ] **Step 3: 编写 02-transform.ts — transform 数据转换**

演示:
- `Schema.transform(from, to, decode, encode)` — 双向转换
- `Schema.transformOrFail` — 可能失败的转换
- `Schema.compose` — 组合两个 Schema
- 实际场景: 字符串日期 ↔ Date 对象、snake_case ↔ camelCase

- [ ] **Step 4: 编写 03-extend-omit.ts — extend / omit**

演示:
- `Schema.extend(base, { extra })` — 扩展字段
- `Schema.omit(base, "field1", "field2")` — 移除字段
- `Schema.pick(base, "field1")` — 选取字段
- `Schema.partial(base)` — 所有字段可选
- `Schema.required(base)` — 所有字段必填

- [ ] **Step 5: 编写 04-recursive.ts — 递归 Schema**

演示:
- `Schema.Lazy(() => schema)` — 延迟引用实现递归
- 树形结构: `type TreeNode = { value: number; children: TreeNode[] }`
- 递归 Schema 的 encode/decode
- 递归深度限制

- [ ] **Step 6: 编写 05-api-types.ts — 构建 API 类型体系**

演示:
- 参考 OpenCode LLM 事件 Schema 体系
- 构建一个简化版 API 类型系统:
  - 请求 Schema（入参校验）
  - 响应 Schema（出参校验）
  - 事件 Schema（带 tag 的联合类型）
  - 错误 Schema（TaggedErrorClass）
- 展示 Schema 如何成为"单一真相源"

- [ ] **Step 7: 编写 chapter-09-schema-advanced.md**

重点:
- 概念讲解: Schema 是"可组合的类型系统"，不是简单的 validator
- OpenCode 实战引用: LLM 事件 Schema 体系 — `Begin`/`End`/`ToolCall` 等 tagged struct
- 常见陷阱: 递归 Schema 忘记 `Schema.Lazy` 导致循环引用；transform 的 encode/decode 方向混淆

- [ ] **Step 8: 验证 + 提交**

---

### Task 10: 第 10 章 — Effect 模式集锦

**Files:**
- Create: `docs/Effect-ts/chapter-10-effect-patterns.md`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/package.json`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/README.md`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/01-retry-schedule.ts`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/02-timeout-race.ts`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/03-batch-operations.ts`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/04-cache-once.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 5 章 错误处理
- Produces: Effect 模式集锦 + 4 个可运行示例

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-retry-schedule.ts — retry + Schedule**

演示:
- `Effect.retry({ times: 3 })` — 固定次数重试
- `Effect.retry({ while: (err) => ... })` — 条件重试
- `Schedule.once` / `Schedule.recurs(n)` — 基础调度
- `Schedule.exponential(base, factor)` — 指数退避
- `Schedule.spaced(interval)` — 固定间隔
- `Schedule.jittered` — 添加随机抖动
- `Effect.retry(effect, schedule)` — 组合使用

- [ ] **Step 3: 编写 02-timeout-race.ts — timeout 与 race**

演示:
- `Effect.timeout(effect, duration)` — 超时失败
- `Effect.timeoutOrElse(effect, duration, fallback)` — 超时降级
- `Effect.race(effectA, effectB)` — 竞速，取先完成者
- `Effect.raceAll([e1, e2, e3])` — 多路竞速
- `Effect.raceFirst([e1, e2])` — 取第一个成功者
- 实际场景: 多路 API 调用取最快响应

- [ ] **Step 4: 编写 03-batch-operations.ts — 批量操作**

演示:
- `Effect.forEach(items, fn)` — 顺序处理
- `Effect.forEach(items, fn, { concurrency: 3 })` — 并发控制
- `Effect.all([e1, e2, e3])` — 并发执行
- `Effect.all([e1, e2, e3], { concurrency: 2 })` — 限制并发
- `Effect.allSuccesses([e1, e2, e3])` — 只取成功的
- `Effect.partition(effects, predicate)` — 分组执行

- [ ] **Step 5: 编写 04-cache-once.ts — cached / once**

演示:
- `Effect.cached(effect)` — 缓存 Effect 结果
- `Effect.cachedWithTTL(effect, duration)` — 带 TTL 的缓存
- `Effect.once` — 只执行一次
- `Effect.cachedFunction(fn)` — 缓存函数调用结果
- 缓存失效与刷新策略

- [ ] **Step 6: 编写 chapter-10-effect-patterns.md**

重点:
- 概念讲解: 这些模式是 Effect 的"标准库"，组合使用解决复杂问题
- 常见陷阱: retry 无限循环；timeout 后 Fiber 未清理；cached 内存无限增长

- [ ] **Step 7: 验证 + 提交**

---

### Task 11: 第 11 章 — Fiber 轻量级并发

**Files:**
- Create: `docs/Effect-ts/chapter-11-fiber.md`
- Create: `docs/Effect-ts/demos/ch11-fiber/package.json`
- Create: `docs/Effect-ts/demos/ch11-fiber/README.md`
- Create: `docs/Effect-ts/demos/ch11-fiber/src/01-fiber-vs-promise.ts`
- Create: `docs/Effect-ts/demos/ch11-fiber/src/02-fork-join-interrupt.ts`
- Create: `docs/Effect-ts/demos/ch11-fiber/src/03-lifecycle.ts`
- Create: `docs/Effect-ts/demos/ch11-fiber/src/04-structured-concurrency.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 6 章 Scope
- Produces: Fiber 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/effect/runner.ts` — Fiber + Deferred + SynchronizedRef 状态机

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-fiber-vs-promise.ts — Fiber vs Promise 本质差异**

演示:
- Promise: 创建即开始执行，不可取消
- Fiber: `fork` 后才开始，可 interrupt
- Promise: 无结构化并发
- Fiber: Scope 内自动管理生命周期
- Promise: 错误可能未处理（unhandled rejection）
- Fiber: 错误类型在签名中，必须处理
- 并排对比代码

- [ ] **Step 3: 编写 02-fork-join-interrupt.ts — fork / join / interrupt**

演示:
- `Effect.fork(effect)` — 创建 Fiber
- `Fiber.join(fiber)` — 等待 Fiber 完成并获取结果
- `Fiber.interrupt(fiber)` — 中断 Fiber
- `Fiber.interruptAs(fiber, fiberId)` — 指定中断源
- `Fiber.await(fiber)` — 等待完成（不获取结果）
- `Fiber.poll(fiber)` — 非阻塞检查状态

- [ ] **Step 4: 编写 03-lifecycle.ts — Fiber 生命周期与状态**

演示:
- Fiber 状态: Suspended → Running → Done(Exit)
- `Fiber.status(fiber)` — 获取当前状态
- `Fiber.map(fiber, fn)` — 映射 Fiber 结果
- `Fiber.orElse(fiber, fallback)` — Fiber 级错误恢复
- `Fiber.zip(fiberA, fiberB)` — 配对两个 Fiber

- [ ] **Step 5: 编写 04-structured-concurrency.ts — 结构化并发**

演示:
- `Effect.forkIn(scope)` — 在 Scope 内 fork
- Scope 关闭 → 所有子 Fiber 自动 interrupt
- `Effect.all` 的并发行为与 Fiber 的关系
- 参考 `runner.ts` 的 `RunHandle`/`ShellHandle` Fiber 管理模式
- 构建一个简化的任务管理器: fork → 监控 → 取消

- [ ] **Step 6: 编写 chapter-11-fiber.md**

重点:
- 概念讲解: Fiber 是 Effect 的并发单元，比 Promise 更可控
- OpenCode 实战引用: `runner.ts` — `RunHandle.fiber` + `ShellHandle.fiber` + `SynchronizedRef` 状态机
- 常见陷阱: 忘记 Scope 导致 Fiber 泄漏；interrupt 后未处理 `Cause.Interrupt`

- [ ] **Step 7: 验证 + 提交**

---

### Task 12: 第 12 章 — Stream 响应式数据处理

**Files:**
- Create: `docs/Effect-ts/chapter-12-stream.md`
- Create: `docs/Effect-ts/demos/ch12-stream/package.json`
- Create: `docs/Effect-ts/demos/ch12-stream/README.md`
- Create: `docs/Effect-ts/demos/ch12-stream/src/01-create-stream.ts`
- Create: `docs/Effect-ts/demos/ch12-stream/src/02-transform.ts`
- Create: `docs/Effect-ts/demos/ch12-stream/src/03-consume.ts`
- Create: `docs/Effect-ts/demos/ch12-stream/src/04-merge-zip.ts`
- Create: `docs/Effect-ts/demos/ch12-stream/src/05-backpressure.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 11 章 Fiber
- Produces: Stream 完整入门 + 5 个可运行示例
- OpenCode 参考: `packages/opencode/src/file/ripgrep.ts` — Stream + Queue 实时日志管道

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-create-stream.ts — 创建 Stream**

演示:
- `Stream.fromIterable(array)` — 从数组创建
- `Stream.fromEffect(effect)` — 从 Effect 创建（单元素）
- `Stream.fromQueue(queue)` — 从 Queue 创建
- `Stream.repeatValue(value)` — 重复值
- `Stream.schedule(schedule)` — 按 Schedule 发射
- `Stream.range(min, max)` — 范围流

- [ ] **Step 3: 编写 02-transform.ts — Stream 转换操作**

演示:
- `Stream.map(fn)` / `Stream.filter(pred)` / `Stream.tap(fn)`
- `Stream.mapEffect(fn)` — 对每个元素执行 Effect
- `Stream.take(n)` / `Stream.takeWhile(pred)` — 截取
- `Stream.drop(n)` / `Stream.dropWhile(pred)` — 丢弃
- `Stream.changes` — 去重（只发射变化的值）

- [ ] **Step 4: 编写 03-consume.ts — 消费 Stream**

演示:
- `Stream.runCollect(stream)` — 收集所有元素
- `Stream.runForEach(stream, fn)` — 逐元素处理
- `Stream.runFold(stream, init, fn)` — 折叠
- `Stream.runHead(stream)` — 取第一个元素
- `Stream.runCount(stream)` — 计数
- `Stream.runDrain(stream)` — 排空（忽略元素）

- [ ] **Step 5: 编写 04-merge-zip.ts — 合并与分流**

演示:
- `Stream.merge(streamA, streamB)` — 交错合并
- `Stream.zip(streamA, streamB)` — 配对合并
- `Stream.concat(streamA, streamB)` — 顺序连接
- `Stream.broadcast(stream, n)` — 广播到多个消费者
- `Stream.groupBy(stream, keyFn)` — 按 key 分组

- [ ] **Step 6: 编写 05-backpressure.ts — 背压机制**

演示:
- Stream 的 pull-based 模型
- 消费者速度慢于生产者时的行为
- `Stream.buffer(n)` — 添加缓冲
- `Stream.throttle` — 节流控制
- 参考 `ripgrep.ts` 的 Stream + Queue 管道模式

- [ ] **Step 7: 编写 chapter-12-stream.md**

重点:
- 概念讲解: Stream 是"pull-based 响应式流"，消费者控制速度
- OpenCode 实战引用: `ripgrep.ts` — `Stream.fromQueue` + `Stream.mapEffect` + `Stream.runForEach` 日志管道
- 常见陷阱: 忘记消费 Stream（lazy，不消费不执行）；背压不足导致内存溢出

- [ ] **Step 8: 验证 + 提交**

---

### Task 13: 第 13 章 — Queue 与 Deferred 异步协调

**Files:**
- Create: `docs/Effect-ts/chapter-13-queue-deferred.md`
- Create: `docs/Effect-ts/demos/ch13-queue-deferred/package.json`
- Create: `docs/Effect-ts/demos/ch13-queue-deferred/README.md`
- Create: `docs/Effect-ts/demos/ch13-queue-deferred/src/01-queue-types.ts`
- Create: `docs/Effect-ts/demos/ch13-queue-deferred/src/02-queue-ops.ts`
- Create: `docs/Effect-ts/demos/ch13-queue-deferred/src/03-deferred.ts`
- Create: `docs/Effect-ts/demos/ch13-queue-deferred/src/04-producer-consumer.ts`

**Interfaces:**
- Consumes: 第 11 章 Fiber, 第 12 章 Stream
- Produces: Queue + Deferred 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/mcp/index.ts` — Queue 模式

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-queue-types.ts — Queue 类型**

演示:
- `Queue.bounded(n)` — 有界队列（满时阻塞）
- `Queue.unbounded()` — 无界队列
- `Queue.sliding(n)` — 滑动队列（满时丢弃最旧）
- `Queue.dropping(n)` — 丢弃队列（满时丢弃最新）
- 各类型的适用场景对比

- [ ] **Step 3: 编写 02-queue-ops.ts — Queue 操作**

演示:
- `Queue.offer(queue, item)` — 入队
- `Queue.take(queue)` — 出队（阻塞等待）
- `Queue.takeAll(queue)` — 取出所有元素
- `Queue.poll(queue)` — 非阻塞出队
- `Queue.capacity(queue)` — 查询容量
- `Queue.size(queue)` — 查询当前大小
- `Queue.isFull(queue)` / `Queue.isEmpty(queue)`

- [ ] **Step 4: 编写 03-deferred.ts — Deferred 一次性信号**

演示:
- `Deferred.make<E, A>()` — 创建 Deferred
- `Deferred.succeed(deferred, value)` — 成功完成
- `Deferred.fail(deferred, error)` — 失败完成
- `Deferred.await(deferred)` — 等待完成
- `Deferred.poll(deferred)` — 非阻塞检查
- `Deferred.isDone(deferred)` — 是否已完成
- Deferred vs Promise 的对比

- [ ] **Step 5: 编写 04-producer-consumer.ts — 生产者-消费者模式**

演示:
- 使用 Queue 构建生产者-消费者管道
- 多个生产者 → Queue → 多个消费者
- Fiber 管理生产者和消费者的生命周期
- 优雅关闭: 生产者完成 → 消费者排空队列 → 关闭
- 参考 `mcp/index.ts` 的 Queue 使用模式

- [ ] **Step 6: 编写 chapter-13-queue-deferred.md**

重点:
- 概念讲解: Queue 是 Fiber 间通信的管道，Deferred 是一次性同步点
- OpenCode 实战引用: `mcp/index.ts` 的 Queue 模式
- 常见陷阱: bounded Queue 满时死锁；Deferred 未 complete 导致永久等待

- [ ] **Step 7: 验证 + 提交**

---

### Task 14: 第 14 章 — 高级并发原语

**Files:**
- Create: `docs/Effect-ts/chapter-14-advanced-concurrency.md`
- Create: `docs/Effect-ts/demos/ch14-advanced-concurrency/package.json`
- Create: `docs/Effect-ts/demos/ch14-advanced-concurrency/README.md`
- Create: `docs/Effect-ts/demos/ch14-advanced-concurrency/src/01-synchronized-ref.ts`
- Create: `docs/Effect-ts/demos/ch14-advanced-concurrency/src/02-latch.ts`
- Create: `docs/Effect-ts/demos/ch14-advanced-concurrency/src/03-fiber-map.ts`
- Create: `docs/Effect-ts/demos/ch14-advanced-concurrency/src/04-scoped-cache.ts`
- Create: `docs/Effect-ts/demos/ch14-advanced-concurrency/src/05-pubsub.ts`

**Interfaces:**
- Consumes: 第 11 章 Fiber, 第 13 章 Queue/Deferred, 第 6 章 Scope
- Produces: 高级并发原语 + 5 个可运行示例
- OpenCode 参考: `packages/opencode/src/control-plane/workspace.ts` — FiberMap + Stream

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-synchronized-ref.ts — SynchronizedRef**

演示:
- `SynchronizedRef.make(initial)` — 创建并发安全引用
- `SynchronizedRef.get(ref)` — 读取
- `SynchronizedRef.set(ref, value)` — 写入
- `SynchronizedRef.update(ref, fn)` — 原子更新
- `SynchronizedRef.modify(ref, fn)` — 原子读+写
- 多个 Fiber 并发读写不丢更新
- 参考 `runner.ts` 的 `SynchronizedRef` 状态管理模式

- [ ] **Step 3: 编写 02-latch.ts — Latch 并发门闩**

演示:
- `Latch.make(n)` — 创建门闩（等待 n 个信号）
- `Latch.open(latch)` — 释放一个信号
- `Latch.await(latch)` — 等待所有信号
- `Latch.releaseAll(latch)` — 一次性释放所有
- 实际场景: 等待所有子任务初始化完成

- [ ] **Step 4: 编写 03-fiber-map.ts — FiberMap 命名管理**

演示:
- `FiberMap.make()` — 创建命名 Fiber 集合
- `FiberMap.set(map, key, fiber)` — 添加 Fiber
- `FiberMap.get(map, key)` — 获取 Fiber
- `FiberMap.remove(map, key)` — 移除并 interrupt
- `FiberMap.awaitAll(map)` — 等待所有 Fiber
- 参考 `workspace.ts` 的 FiberMap 使用模式

- [ ] **Step 5: 编写 04-scoped-cache.ts — ScopedCache 作用域缓存**

演示:
- `ScopedCache.make({ capacity, timeToLive })` — 创建缓存
- `ScopedCache.get(cache, key)` — 获取（自动加载）
- `ScopedCache.refresh(cache, key)` — 刷新
- `ScopedCache.invalidate(cache, key)` — 失效
- Scope 关闭时缓存自动清理

- [ ] **Step 6: 编写 05-pubsub.ts — PubSub 发布订阅**

演示:
- `PubSub.make()` — 创建发布订阅
- `PubSub.publish(pubsub, message)` — 发布
- `PubSub.subscribe(pubsub)` — 订阅（返回 Stream）
- 多个订阅者独立接收消息
- 与 Queue 的对比（广播 vs 点对点）

- [ ] **Step 7: 编写 chapter-14-advanced-concurrency.md**

重点:
- 概念讲解: 这些原语是构建复杂并发系统的基础组件
- OpenCode 实战引用: `workspace.ts` 的 FiberMap + Stream 模式
- 常见陷阱: SynchronizedRef 的 modify 函数必须是纯的；Latch 计数不匹配导致死锁

- [ ] **Step 8: 验证 + 提交**

---

### Task 15: 第 15 章 — 性能分析与优化

**Files:**
- Create: `docs/Effect-ts/chapter-15-performance.md`
- Create: `docs/Effect-ts/demos/ch15-performance/package.json`
- Create: `docs/Effect-ts/demos/ch15-performance/README.md`
- Create: `docs/Effect-ts/demos/ch15-performance/src/01-overhead-analysis.ts`
- Create: `docs/Effect-ts/demos/ch15-performance/src/02-fiber-scheduling.ts`
- Create: `docs/Effect-ts/demos/ch15-performance/src/03-cache-strategy.ts`
- Create: `docs/Effect-ts/demos/ch15-performance/src/04-stream-tuning.ts`
- Create: `docs/Effect-ts/demos/ch15-performance/src/05-benchmark.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 10 章 Effect 模式, 第 11 章 Fiber, 第 12 章 Stream
- Produces: 性能分析章节 + 5 个可运行示例

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-overhead-analysis.ts — Effect 运行时开销分析**

演示:
- Effect 创建的开销（vs 直接函数调用）
- `Effect.flatMap` 链 vs `Effect.gen` 的性能差异
- `Effect.all` vs 顺序 `flatMap` 的吞吐量对比
- 使用 `performance.now()` 测量

- [ ] **Step 3: 编写 02-fiber-scheduling.ts — Fiber 调度**

演示:
- Fiber 的默认调度策略（公平轮转）
- 大量 Fiber 并发时的调度开销
- `Effect.fork` vs `Effect.all` 的调度差异
- Fiber 优先级与调度观察

- [ ] **Step 4: 编写 03-cache-strategy.ts — 缓存策略**

演示:
- `Effect.cached` vs `Effect.cachedWithTTL` 命中率对比
- 缓存 key 的设计对命中率的影响
- 缓存容量限制与淘汰策略
- 缓存 warming 策略

- [ ] **Step 5: 编写 04-stream-tuning.ts — Stream chunk 调优**

演示:
- Stream chunk 大小对吞吐量的影响
- `Stream.buffer` 大小与内存占用的权衡
- `Stream.grouped` 批量处理 vs 逐元素处理
- 不同并发数下的 Stream 性能

- [ ] **Step 6: 编写 05-benchmark.ts — 基准测试方法**

演示:
- 使用 `performance.now()` 进行微基准测试
- 预热与多次运行取平均
- 对比测试: 纯 TS vs Effect-TS 实现同一功能
- 性能测试的注意事项（JIT、GC 干扰）

- [ ] **Step 7: 编写 chapter-15-performance.md**

重点:
- 概念讲解: Effect 的性能开销可控，关键在于理解开销来源
- 常见陷阱: 过早优化；不必要的 `flatMap` 嵌套；Stream chunk 过小

- [ ] **Step 8: 验证 + 提交**

---

### Task 16: 第 16 章 — 内存管理

**Files:**
- Create: `docs/Effect-ts/chapter-16-memory.md`
- Create: `docs/Effect-ts/demos/ch16-memory/package.json`
- Create: `docs/Effect-ts/demos/ch16-memory/README.md`
- Create: `docs/Effect-ts/demos/ch16-memory/src/01-closure-chains.ts`
- Create: `docs/Effect-ts/demos/ch16-memory/src/02-scope-release.ts`
- Create: `docs/Effect-ts/demos/ch16-memory/src/03-fiber-leak.ts`
- Create: `docs/Effect-ts/demos/ch16-memory/src/04-stream-buffer.ts`
- Create: `docs/Effect-ts/demos/ch16-memory/src/05-layer-lifecycle.ts`

**Interfaces:**
- Consumes: 第 6 章 Scope, 第 11 章 Fiber, 第 12 章 Stream, 第 8 章 Layer 进阶
- Produces: 内存管理章节 + 5 个可运行示例

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-closure-chains.ts — Effect 闭包与内存引用**

演示:
- Effect 管道中的闭包链如何持有引用
- `pipe` 链中每个中间值的内存保持
- `Effect.gen` 中闭包的生命周期
- 如何减少不必要的闭包引用

- [ ] **Step 3: 编写 02-scope-release.ts — Scope 与资源释放时机**

演示:
- Scope 关闭时资源的释放顺序
- `addFinalizer` 的释放时机
- Scope fork 的独立释放
- 资源未及时释放导致的内存增长模拟

- [ ] **Step 4: 编写 03-fiber-leak.ts — Fiber 泄漏检测与预防**

演示:
- Fiber 未 join/interrupt 导致的内存泄漏
- 使用 Scope 防止 Fiber 泄漏
- Fiber 泄漏的检测方法（跟踪 Fiber 数量）
- 长时间运行应用的 Fiber 管理策略

- [ ] **Step 5: 编写 04-stream-buffer.ts — Stream 缓冲内存控制**

演示:
- `Stream.buffer(n)` 的内存占用
- 无界 buffer 导致的内存溢出风险
- 使用 bounded Queue 控制 Stream 内存
- 背压不足时的内存增长

- [ ] **Step 6: 编写 05-layer-lifecycle.ts — Layer 生命周期与内存**

演示:
- Layer 创建的服务实例的生命周期
- `Layer.fresh` vs 默认 Layer 的内存差异
- `ManagedRuntime` 的 dispose 与内存释放
- 大型 Layer 图的内存占用估算

- [ ] **Step 7: 编写 chapter-16-memory.md**

重点:
- 概念讲解: Effect 的内存模型受 Scope 和 Fiber 生命周期影响
- 常见陷阱: Fiber 泄漏是最常见的内存问题；Stream buffer 无界增长

- [ ] **Step 8: 验证 + 提交**

---

### Task 17: 第 17 章 — Effect-TS 实现原理

**Files:**
- Create: `docs/Effect-ts/chapter-17-internals.md`
- Create: `docs/Effect-ts/demos/ch17-internals/package.json`
- Create: `docs/Effect-ts/demos/ch17-internals/README.md`
- Create: `docs/Effect-ts/demos/ch17-internals/src/01-effect-internal.ts`
- Create: `docs/Effect-ts/demos/ch17-internals/src/02-fiber-runtime.ts`
- Create: `docs/Effect-ts/demos/ch17-internals/src/03-layer-resolution.ts`
- Create: `docs/Effect-ts/demos/ch17-internals/src/04-schema-ast.ts`
- Create: `docs/Effect-ts/demos/ch17-internals/src/05-stream-pull.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 4 章 Layer, 第 3 章 Schema, 第 11 章 Fiber, 第 12 章 Stream
- Produces: 实现原理章节 + 5 个可运行示例（探索性代码）

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-effect-internal.ts — Effect 类型内部结构**

演示:
- Effect 类型的简化版实现（展示核心概念）
- `Effect` 本质是一个惰性描述的代数数据类型
- `succeed` / `fail` / `flatMap` 的内部表示
- 类型参数 R/E/A 如何在内部流转
- 不运行 Effect 就不会执行任何副作用

- [ ] **Step 3: 编写 02-fiber-runtime.ts — Fiber 运行时事件循环**

演示:
- Fiber 运行时的简化模型
- 事件循环: 调度 → 执行 → 完成/暂停
- Fiber 的栈帧与上下文切换
- interrupt 的协作式实现（yield 点检查）
- 与 Promise 微任务队列的对比

- [ ] **Step 4: 编写 03-layer-resolution.ts — Layer 依赖解析算法**

演示:
- Layer 的依赖图构建过程
- 拓扑排序解析依赖顺序
- 循环依赖检测
- `Layer.unwrap` 的延迟解析
- `Layer.provideMerge` 的合并算法

- [ ] **Step 5: 编写 04-schema-ast.ts — Schema AST 与编译器**

演示:
- Schema 的内部 AST 结构
- `Schema.Struct` 如何编译为 decode/encode 函数
- `Schema.transform` 的 AST 表示
- Schema 的类型推导机制（`typeof schema.Type`）
- 与 Zod 的 AST 对比

- [ ] **Step 6: 编写 05-stream-pull.ts — Stream pull-based 实现**

演示:
- Stream 的 pull-based 模型内部机制
- 消费者驱动: 每次 pull 请求一个元素
- `Stream.map` / `Stream.flatMap` 的惰性链
- 背压的自然实现: 消费者不 pull 就不生产
- 与 RxJS push-based 模型的对比

- [ ] **Step 7: 编写 chapter-17-internals.md**

重点:
- 概念讲解: 理解内部原理有助于调试和优化
- 与 ZIO 对比: Effect-TS 是 ZIO 的 TypeScript 移植，设计理念一致
- 常见陷阱: 本章为进阶内容，不要求初学者完全掌握

- [ ] **Step 8: 验证 + 提交**

---

### Task 18: 第 18 章 — 典型问题处理手册

**Files:**
- Create: `docs/Effect-ts/chapter-18-problem-handbook.md`
- Create: `docs/Effect-ts/demos/ch18-problem-handbook/package.json`
- Create: `docs/Effect-ts/demos/ch18-problem-handbook/README.md`
- Create: `docs/Effect-ts/demos/ch18-problem-handbook/src/01-long-running-task.ts`
- Create: `docs/Effect-ts/demos/ch18-problem-handbook/src/02-rate-limiting.ts`
- Create: `docs/Effect-ts/demos/ch18-problem-handbook/src/03-graceful-degradation.ts`
- Create: `docs/Effect-ts/demos/ch18-problem-handbook/src/04-debugging.ts`
- Create: `docs/Effect-ts/demos/ch18-problem-handbook/src/05-anti-patterns.ts`

**Interfaces:**
- Consumes: 第 5 章 错误处理, 第 10 章 Effect 模式, 第 11 章 Fiber, 第 12 章 Stream
- Produces: 问题处理手册 + 5 个可运行示例

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-long-running-task.ts — 长时间任务取消与清理**

演示:
- 使用 `Effect.timeout` + `Fiber.interrupt` 取消长时间任务
- `Effect.onInterrupt` 注册取消回调
- 取消时的资源清理（Scope + finalizer）
- 部分结果保存（checkpoint 模式）

- [ ] **Step 3: 编写 02-rate-limiting.ts — 并发限制与速率控制**

演示:
- `Effect.forEach(items, fn, { concurrency: n })` 限制并发
- `Schedule.spaced(interval)` 限制速率
- `Queue.bounded(n)` 作为速率控制器
- Token bucket 算法的 Effect 实现

- [ ] **Step 4: 编写 03-graceful-degradation.ts — 部分失败与优雅降级**

演示:
- `Effect.allSuccesses` — 忽略失败项
- `Effect.partition` — 分离成功和失败
- `Effect.orElseSucceed` — 失败时返回默认值
- 降级策略: 主服务失败 → 备选服务 → 缓存 → 默认值

- [ ] **Step 5: 编写 04-debugging.ts — 调试技巧**

演示:
- `Effect.tap` / `Effect.tapError` — 插入日志
- `Effect.withLogSpan` — 添加追踪 span
- `Cause.pretty` — 格式化错误链
- `Fiber.dump` — 导出 Fiber 状态
- `Effect.annotateCurrentSpan` — 添加调试信息

- [ ] **Step 6: 编写 05-anti-patterns.ts — 常见反模式**

演示:
- 反模式 1: 在 Effect 外部使用 try/catch 包裹 runPromise
- 反模式 2: 过度使用 `Effect.runSync` 阻塞执行
- 反模式 3: 忘记提供 Layer 导致运行时错误
- 反模式 4: 在 gen 中使用 `await` 而非 `yield*`
- 反模式 5: 创建 Fiber 但不管理生命周期
- 每个反模式展示错误写法 + 正确写法

- [ ] **Step 7: 编写 chapter-18-problem-handbook.md**

重点:
- 概念讲解: 这是"遇到问题查这一章"的实用手册
- 常见陷阱: 本章本身就是反模式和解决方案的集合

- [ ] **Step 8: 验证 + 提交**

---

### Task 19: 第 19 章 — OpenCode 实战案例剖析

**Files:**
- Create: `docs/Effect-ts/chapter-19-opencode-cases.md`
- Create: `docs/Effect-ts/demos/ch19-opencode-cases/package.json`
- Create: `docs/Effect-ts/demos/ch19-opencode-cases/README.md`
- Create: `docs/Effect-ts/demos/ch19-opencode-cases/src/01-runtime-arch.ts`
- Create: `docs/Effect-ts/demos/ch19-opencode-cases/src/02-tool-system.ts`
- Create: `docs/Effect-ts/demos/ch19-opencode-cases/src/03-mcp-client.ts`
- Create: `docs/Effect-ts/demos/ch19-opencode-cases/src/04-file-watcher.ts`
- Create: `docs/Effect-ts/demos/ch19-opencode-cases/src/05-permission-system.ts`

**Interfaces:**
- Consumes: 第 4/8 章 Layer, 第 11 章 Fiber, 第 12 章 Stream, 第 13 章 Queue/Deferred, 第 14 章 高级并发
- Produces: OpenCode 实战剖析 + 5 个可运行示例（简化版复现）
- OpenCode 参考: `app-runtime.ts`, `tool/`, `mcp/`, `file/watcher.ts`, `permission/`

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-runtime-arch.ts — Runtime 架构**

演示:
- 简化版 `ManagedRuntime` + `Layer.mergeAll` 模式
- 构建 5-8 个服务的简化 AppLayer
- `runSync` / `runPromise` / `runFork` 的封装
- 参考 `app-runtime.ts` 的完整架构（50+ 服务），展示简化版

- [ ] **Step 3: 编写 02-tool-system.ts — 工具系统 Effect 封装**

演示:
- 工具注册: `Context.Tag` + `Layer` 模式
- 工具执行: `Effect.gen` + 错误处理
- 工具权限: Schema 校验输入参数
- 参考 OpenCode `tool/` 目录的封装模式

- [ ] **Step 4: 编写 03-mcp-client.ts — MCP 客户端 Stream + Queue**

演示:
- MCP 协议: JSON-RPC 请求/响应
- `Queue` 管理待发送请求
- `Stream` 处理服务器推送
- `Fiber` 管理连接生命周期
- 参考 `mcp/index.ts` 的 Queue + Stream 模式

- [ ] **Step 5: 编写 04-file-watcher.ts — 文件监控 Fiber + Scope**

演示:
- 文件监控: `Stream` 监听文件变化
- `Fiber` 后台运行监控任务
- `Scope` 管理监控生命周期
- 参考 `file/watcher.ts` 的 Fiber + Scope 模式

- [ ] **Step 6: 编写 05-permission-system.ts — 权限系统 Schema + Deferred**

演示:
- 权限请求: `Schema.TaggedStruct` 定义请求类型
- 权限确认: `Deferred` 等待用户响应
- 权限状态机: `SynchronizedRef` 管理状态
- 参考 `permission/` 的 Schema + Deferred 模式

- [ ] **Step 7: 编写 chapter-19-opencode-cases.md**

重点:
- 概念讲解: 从真实项目中提炼可复用的设计模式
- 设计模式提炼: Runtime 模式、Tool 封装模式、Stream+Queue 管道模式、Fiber+Scope 生命周期模式、Schema+Deferred 交互模式
- 常见陷阱: 过度模仿 OpenCode 的复杂度；忽略自己项目的实际需求

- [ ] **Step 8: 验证 + 提交**

---

### Task 20: 第 20 章 — 迁移指南与生态展望

**Files:**
- Create: `docs/Effect-ts/chapter-20-migration-guide.md`
- Create: `docs/Effect-ts/demos/ch20-migration-guide/package.json`
- Create: `docs/Effect-ts/demos/ch20-migration-guide/README.md`
- Create: `docs/Effect-ts/demos/ch20-migration-guide/src/01-migration-strategy.ts`
- Create: `docs/Effect-ts/demos/ch20-migration-guide/src/02-react-integration.ts`
- Create: `docs/Effect-ts/demos/ch20-migration-guide/src/03-ecosystem.ts`

**Interfaces:**
- Consumes: 全书所有章节
- Produces: 迁移指南 + 3 个可运行示例

- [ ] **Step 1: 创建 demo 目录和 package.json**
- [ ] **Step 2: 编写 01-migration-strategy.ts — 逐步迁移策略**

演示:
- 阶段 1: 引入 Schema 替代 zod（最小侵入）
- 阶段 2: 用 Effect 包装关键异步操作
- 阶段 3: 引入 Layer 管理依赖
- 阶段 4: 全面采用 Effect 架构
- 每个阶段的代码示例: 迁移前 → 迁移后

- [ ] **Step 3: 编写 02-react-integration.ts — 与 React 集成**

演示:
- `Effect.runPromise` 在 React 组件中的使用
- `useEffect` + Scope 管理 Effect 生命周期
- `Effect.runFork` 在事件处理器中的使用
- 与 React Query / SWR 的对比与互补

- [ ] **Step 4: 编写 03-ecosystem.ts — Effect 生态**

演示:
- `@effect/platform` — HTTP Client、FileSystem、Path
- `@effect/cli` — 命令行应用构建
- `@effect/rpc` — 远程过程调用
- `@effect/sql` — 数据库访问
- 各库的基础用法示例

- [ ] **Step 5: 编写 chapter-20-migration-guide.md**

重点:
- 概念讲解: 迁移不是"全有或全无"，可以逐步引入
- Effect 4.0 新特性: 更简洁的 API、更好的类型推断、Standard Schema 兼容
- 学习资源: 官方文档、Discord 社区、awesome-effect 列表
- 常见陷阱: 一次性迁移风险大；团队培训不足导致抗拒

- [ ] **Step 6: 验证 + 提交**

---

### Task 21: 最终审查与集成

**Files:**
- Modify: `docs/Effect-ts/BOOK-OUTLINE.md` (更新实际完成状态)
- Create: `docs/Effect-ts/README.md`

**Interfaces:**
- Consumes: 所有 20 章内容 + demos
- Produces: 全书 README + 完成状态大纲

- [ ] **Step 1: 创建全书 README.md**

内容:
- 书籍简介与目标读者
- 全书结构概览（五部分 20 章）
- 阅读路线图（初学者路线 / 进阶者路线）
- Demo 运行说明（`bun install && bun run src/<file>.ts`）
- 术语索引
- 版本说明（Effect 4.0.0-beta.65）

- [ ] **Step 2: 更新 BOOK-OUTLINE.md 完成状态**

每章标注: 内容完成度、demo 完成度、审阅状态

- [ ] **Step 3: 全局一致性检查**

检查项:
- 所有 demo 的 package.json 使用相同的 effect 版本
- 术语在全书中的使用一致（首次出现附中文翻译，后续统一英文）
- 章节间的交叉引用正确（"详见第 X 章"指向正确的章节）
- 所有 demo 可独立运行

- [ ] **Step 4: 运行全部 demo 验证**

```bash
for dir in docs/Effect-ts/demos/ch*/; do
  echo "=== $dir ==="
  cd "$dir" && bun install --silent
  for f in src/*.ts; do
    echo "  Running: $f"
    bun run "$f" || echo "  FAILED: $f"
  done
  cd -
done
```

- [ ] **Step 5: 最终提交**

```bash
git add docs/Effect-ts/
git commit -m "docs: Effect-TS book - all 20 chapters with demos"
```

---

## 执行顺序

```
Task 0:  脚手架 (BOOK-OUTLINE.md + tsconfig.base.json)
  ↓
Task 1:  第 1 章  (无前置依赖)
  ↓
Task 2:  第 2 章  (依赖第 1 章)
  ↓
Task 3:  第 3 章  (依赖第 2 章)
  ↓
Task 4:  第 4 章  (依赖第 2 章)
  ↓
Task 5:  第 5 章  (依赖第 2, 3 章)
  ↓
Task 6:  第 6 章  (依赖第 2, 4 章)
  ↓
Task 7:  第 7 章  (依赖第 2, 4 章)
  ↓
Task 8:  第 8 章  (依赖第 4, 7 章)
  ↓
Task 9:  第 9 章  (依赖第 3 章)
  ↓
Task 10: 第 10 章 (依赖第 2, 5 章)
  ↓
Task 11: 第 11 章 (依赖第 2, 6 章)
  ↓
Task 12: 第 12 章 (依赖第 2, 11 章)
  ↓
Task 13: 第 13 章 (依赖第 11, 12 章)
  ↓
Task 14: 第 14 章 (依赖第 11, 13, 6 章)
  ↓
Task 15: 第 15 章 (依赖第 2, 10, 11, 12 章)
  ↓
Task 16: 第 16 章 (依赖第 6, 11, 12, 8 章)
  ↓
Task 17: 第 17 章 (依赖第 2, 4, 3, 11, 12 章)
  ↓
Task 18: 第 18 章 (依赖第 5, 10, 11, 12 章)
  ↓
Task 19: 第 19 章 (依赖第 4/8, 11, 12, 13, 14 章)
  ↓
Task 20: 第 20 章 (依赖全书)
  ↓
Task 21: 最终审查
```

## 自检清单

- [x] **Spec coverage**: 设计文档中的 20 章全部有对应 Task，每章包含 Markdown + demos + 验证
- [x] **Placeholder scan**: 无 TBD/TODO，所有 demo 文件有明确的文件名、目的和关键 API
- [x] **Type consistency**: 章节 slug 命名一致（ch01-why-effect-ts, ch02-effect-basics, ...），package.json 版本一致（4.0.0-beta.65）
- [x] **Global constraints**: 所有 task 遵循七段式结构、术语规范、独立运行要求
- [x] **执行顺序**: 依赖链清晰，后期章节标注了前置依赖

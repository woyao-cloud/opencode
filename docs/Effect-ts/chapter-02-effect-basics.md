# 第 2 章: Effect 类型入门

## 1. 本章目标

完成本章学习后，你将能够：

- 理解 `Effect<R, E, A>` 三个类型参数的含义：R（Requirements，依赖）、E（Error，可恢复错误）、A（Success，成功值）
- 使用六种构造器（`succeed`、`fail`、`sync`、`try`、`tryPromise`、`promise`）创建 Effect，并理解每种构造器对类型参数的影响
- 使用 `pipe` 和 `flow` 组合 Effect，使用 `map`/`flatMap`/`tap`/`andThen` 进行 Effect 变换
- 使用 `Effect.gen` + `yield*` 编写生成器风格的 Effect 程序，理解其与 `async/await` 的异同
- 使用 `runSync`、`runPromise`、`runFork`、`runPromiseExit` 四种方式运行 Effect，并理解各自的适用场景

## 2. 前置知识

阅读本章前，你需要掌握：

- **第 1 章内容:** 理解 Effect-TS 的核心理念（副作用即数据类型），对 `Effect<R, E, A>` 有初步认知
- **TypeScript 泛型基础:** 理解 `<T>` 语法，知道泛型参数如何约束类型
- **Generator 函数基础:** 了解 `function*` 声明和 `yield` 关键字的基本用法（不需要深入，本章会讲解 `yield*` 在 Effect 中的特殊用法）
- **Promise 与 async/await:** 理解异步函数的声明和执行模型

本章不要求了解 Schema、Context、Layer 等高级概念 — 这些将在后续章节逐步引入。

## 3. 概念讲解

### 3.1 Effect<R, E, A> 三参数模型

Effect-TS 的核心是一个统一的类型：`Effect<R, E, A>`。这个类型有三个参数，每个参数对应程序的一个维度：

| 参数 | 全称 | 含义 | 常见值 |
|------|------|------|--------|
| `R` | Requirements | 程序运行所需的依赖（数据库连接、配置、日志服务等） | `never`（无依赖）或具体的服务类型 |
| `E` | Error | 程序可能产生的可恢复错误类型 | `never`（不会失败）、`Error`、或自定义错误联合类型 |
| `A` | Success | 程序成功时返回的值类型 | 任意类型：`string`、`number`、`{ name: string }` 等 |

**直觉理解:** 可以把 `Effect<R, E, A>` 想象成一个"带标签的计算盒子"：

- 盒子外面贴着两张标签：一张写着"我需要什么才能运行"（R），一张写着"我可能出什么错"（E）
- 盒子里面装着计算结果（A）
- 在盒子被"运行"之前，它只是一个**描述**（description），不是**执行**（execution）

这种"描述 vs 执行"的分离是 Effect-TS 与 Promise 的根本区别。Promise 一旦创建就开始执行，而 Effect 只是一个不可变的值，描述了一个计算计划。你可以安全地组合、传递、复用 Effect，直到最终调用 `runSync`/`runPromise` 等运行函数时才真正执行。

### 3.2 六种 Effect 构造器

创建 Effect 有六种基本方式，每种方式对类型参数的影响不同。理解这些构造器是使用 Effect-TS 的第一步。

#### Effect.succeed — 总是成功

```typescript
const eff = Effect.succeed("Hello")
// 类型: Effect<never, never, string>
```

`succeed` 创建一个总是成功的 Effect。R=never（不需要依赖），E=never（永远不会失败），A 是你传入的值类型。这是最简单的 Effect 构造器，适用于常量、已计算好的值、或者"硬编码"的成功结果。

#### Effect.fail — 总是失败

```typescript
class MyError { readonly _tag = "MyError"; constructor(readonly message: string) {} }
const eff = Effect.fail(new MyError("出错了"))
// 类型: Effect<never, MyError, never>
```

`fail` 创建一个总是失败的 Effect。R=never（不需要依赖），E 是你传入的错误类型，A=never（永远不会成功）。注意：Effect-TS 推荐使用带 `_tag` 字段的类（tagged error）而非裸字符串作为错误类型，这样可以在后续做精确的错误类型匹配。

#### Effect.sync — 同步计算（不捕获异常）

```typescript
const eff = Effect.sync(() => 1 + 2 + 3)
// 类型: Effect<never, never, number>
```

`sync` 将一个同步函数包装为 Effect。它**假设函数不会抛出异常** — 如果函数抛出了异常，该异常会变成"defect"（未定义行为），不会被类型系统跟踪。适用于纯计算、已知不会失败的操作。

#### Effect.try — 同步计算（自动捕获异常）

```typescript
const eff = Effect.try({
  try: () => JSON.parse('{"name": "Alice"}'),
  catch: (err) => (err as Error)
})
// 类型: Effect<never, Error, A>
```

`try` 与 `sync` 的区别在于它会**自动捕获**函数中抛出的异常，将其转为 `Effect.fail`。E 固定为 `Error` 类型（因为 JavaScript 异常总是 `Error` 或其子类）。适用于 `JSON.parse`、文件读取等可能失败的操作。注意 `catch` 是必填参数 — 不存在不带 `catch` 的简单形式。

`try` 也支持自定义错误转换：

```typescript
const eff = Effect.try({
  try: () => JSON.parse(input),
  catch: (err) => new MyParseError((err as Error).message),
})
```

#### Effect.tryPromise — Promise 转 Effect（捕获异常）

```typescript
const eff = Effect.tryPromise(() => fetch("/api/data").then(r => r.json()))
// 类型: Effect<never, Error, A>
```

`tryPromise` 将一个返回 Promise 的函数包装为 Effect。它会捕获 Promise rejection 和函数中的同步异常，转为 `Effect.fail`。E 固定为 `Error`。这是连接 Promise 世界和 Effect 世界的"安全桥梁"。

#### Effect.promise — Promise 转 Effect（不捕获异常）

```typescript
const eff = Effect.promise(() => Promise.resolve("guaranteed"))
// 类型: Effect<never, never, A>
```

`promise` 与 `tryPromise` 的区别在于它**不捕获** Promise rejection。如果 Promise reject，异常会变成 defect。E=never，表示"从类型系统角度看，这个 Effect 不会失败"。仅适用于你 100% 确定不会 reject 的 Promise。

#### 构造器对比总结

| 构造器 | R | E | A | 异常处理 |
|--------|---|---|---|----------|
| `succeed` | `never` | `never` | 传入值 | 无异常 |
| `fail` | `never` | 传入错误 | `never` | 无异常 |
| `sync` | `never` | `never` | 返回值 | 不捕获（变 defect） |
| `try` | `never` | `Error` | 返回值 | 自动捕获 |
| `tryPromise` | `never` | `Error` | 返回值 | 自动捕获 |
| `promise` | `never` | `never` | 返回值 | 不捕获（变 defect） |

### 3.3 pipe 与 flow：Effect 的组合方式

Effect-TS 采用管道（pipeline）风格组合 Effect，核心工具是 `pipe` 和 `flow`。

#### pipe — 立即执行的管道

```typescript
import { pipe } from "effect"

const result = pipe(
  5,
  (n) => n * 2,    // → 10
  (n) => n + 3,    // → 13
  (n) => `结果是 ${n}` // → "结果是 13"
)
```

`pipe(value, fn1, fn2, fn3)` 等价于 `fn3(fn2(fn1(value)))`。优势是类型自动推导，可读性高 — 数据从左到右流动，每一步的类型变化都清晰可见。

#### flow — 创建可复用的组合函数

```typescript
import { flow } from "effect"

const processNumber = flow(
  (n: number) => n * 2,
  (n: number) => n + 3,
  (n: number) => `结果是 ${n}`
)

processNumber(5)  // "结果是 13"
processNumber(10) // "结果是 23"
```

`flow` 与 `pipe` 的区别：`pipe` 立即执行，`flow` 返回一个新函数。`flow` 适合定义可复用的变换管道。

#### Effect 变换操作符

在 `pipe` 中，Effect 有四个核心变换操作符：

**Effect.map** — 变换成功值 A：

```typescript
pipe(
  Effect.succeed(10),
  Effect.map((n) => n * 2)  // Effect<never, never, number> → Effect<never, never, number>
)
// 类型变化: R 不变, E 不变, A → B
```

**Effect.flatMap** — 返回新 Effect 的变换：

```typescript
pipe(
  Effect.succeed("42"),
  Effect.flatMap((s) => parseNumber(s))  // 返回 Effect<never, Error, number>
)
// 类型变化: R 不变, E 可能扩大, A → B
```

`flatMap` 用于"下一步操作也返回 Effect"的场景。注意：新 Effect 可能引入新的错误类型，所以 E 可能扩大。

**Effect.tap** — 副作用观察（不改变值）：

```typescript
pipe(
  Effect.succeed(42),
  Effect.tap((n) => Effect.sync(() => console.log("当前值:", n))),
  Effect.map((n) => n * 2)
)
// 类型变化: R 不变, E 不变, A 不变
```

`tap` 在管道中插入副作用（日志、监控等），但**不改变流经的值**。即使 tap 中的 Effect 失败，主值也不受影响。

**Effect.andThen** — 顺序组合：

```typescript
pipe(
  Effect.sync(() => console.log("步骤 1")),
  Effect.andThen(() => Effect.succeed("步骤 2 完成")),
  Effect.andThen(() => Effect.succeed("done"))
)
// 类型变化: R 不变, E 可能扩大, A → B
```

`andThen` 在当前 Effect 成功后执行下一个 Effect。与 `flatMap` 的区别：`andThen` 可以忽略前一个 Effect 的成功值。

### 3.4 Effect.gen：生成器语法

`Effect.gen` 是 Effect-TS 提供的一种"类 async/await"语法，使用 JavaScript 的 generator 函数来编写 Effect 程序。

#### 基本语法

```typescript
const program = Effect.gen(function* () {
  const a = yield* Effect.succeed("hello")
  const b = yield* Effect.succeed("world")
  return `${a} ${b}`
})
// 类型: Effect<never, never, string>
```

核心规则：
- 用 `Effect.gen(function* () { ... })` 包裹你的程序
- 用 `yield* effect` 解包 Effect，获取其成功值
- 用 `return` 返回最终结果

#### yield* 与 await 的对比

| 维度 | async/await | Effect.gen + yield* |
|------|-------------|---------------------|
| 解包对象 | `await promise` 解包 Promise | `yield* effect` 解包 Effect |
| 错误类型 | `unknown`（类型丢失） | 精确跟踪在 E 类型参数中 |
| 依赖注入 | 无标准方案 | R 类型参数 + Layer 系统 |
| 并发 | `Promise.all` | `Effect.all`（更丰富的配置） |
| 可取消 | `AbortController`（手动） | Fiber 自动支持 |

**关键区别:** `yield*` 不是 `await` — 它解包的是 Effect，不是 Promise。在 `Effect.gen` 中绝对不能使用 `await`，必须使用 `yield*`。

#### 错误传播

当 `yield*` 的 Effect 失败时，错误会自动沿 generator 向上传播，后续代码不会执行。这类似于 async/await 中 await 一个 rejected Promise 的行为，但关键区别是：**错误类型在传播过程中不丢失**。

```typescript
const program = Effect.gen(function* () {
  const x = yield* safeDivide(10, 2)  // 成功: 5
  const y = yield* safeDivide(10, 0)  // 失败: 错误在此处传播
  return x + y                         // 这行不会执行
})
// 类型: Effect<never, Error, number>
// 编译器知道这个 Effect 可能产生 Error
```

#### Effect.all — 并发执行

```typescript
const [a, b, c] = yield* Effect.all([effect1, effect2, effect3])
```

`Effect.all` 并发执行多个 Effect，全部成功后返回结果数组。任一失败则整体失败（fail-fast 语义）。

#### Effect.forEach — 批量处理

```typescript
const results = yield* Effect.forEach(items, (item) => processItem(item))
```

`Effect.forEach` 对每个元素执行 Effect，默认并发执行，返回结果数组。

### 3.5 运行 Effect：从描述到执行

Effect 只是一个"描述"，需要调用运行函数才能真正执行。Effect-TS 提供四种运行方式：

#### Effect.runSync — 同步运行

```typescript
const result = Effect.runSync(effect)
// 要求: R=never
// 返回: A（成功值）
// 失败时: 直接抛出异常
```

最简单的运行方式。要求 Effect 的 R=never（不需要依赖）。如果 Effect 失败，会直接抛出异常。适用于脚本、CLI 工具、纯同步计算。

#### Effect.runPromise — 返回 Promise

```typescript
const promise = Effect.runPromise(effect)
// 要求: R=never
// 返回: Promise<A>
// 失败时: Promise reject
```

将 Effect 世界连接到 Promise 世界。适用于与现有 async/await 代码互操作。

#### Effect.runFork — 返回 Fiber

```typescript
const fiber = Effect.runFork(effect)
// 要求: R=never
// 返回: Fiber.Runtime<E, A>
// 行为: 立即返回，Effect 在后台执行
```

不阻塞当前执行流，Effect 在后台运行。适用于"发射后不管"的操作（日志上报、指标收集等）。后续可通过 `Fiber.join(fiber)` 等待 Fiber 完成并获取结果。

#### Effect.runPromiseExit — 返回 Exit

```typescript
const exit = await Effect.runPromiseExit(effect)
// 要求: R=never
// 返回: Promise<Exit<E, A>>
// 行为: 永不抛出异常，结果包装在 Exit 中
```

最安全的运行方式。无论成功还是失败，结果都包装在 `Exit` 对象中（`Exit._tag === "Success"` 或 `Exit._tag === "Failure"`），永不抛出异常。适用于需要精确处理所有结果的场景，尤其是测试代码。

#### 运行方式对比

| 运行方式 | 同步/异步 | 返回值 | 失败行为 | 适用场景 |
|----------|----------|--------|----------|----------|
| `runSync` | 同步 | `A` | 抛出异常 | 纯同步、脚本、测试 |
| `runPromise` | 异步 | `Promise<A>` | Promise reject | 与 Promise 互操作 |
| `runFork` | 异步 | `Fiber` | Fiber 内部 | 发射后不管、并发 |
| `runPromiseExit` | 异步 | `Exit<E,A>` | 不抛异常 | 安全处理所有结果 |

## 4. 代码示例

本章配套 4 个可独立运行的示例文件，位于 `demos/ch02-effect-basics/src/` 目录下。建议按顺序阅读和运行。

**运行环境准备:**

```bash
cd demos/ch02-effect-basics
bun install
```

### 4.1 `01-effect-types.ts` — Effect\<R, E, A\> 三参数模型

**运行:** `bun run src/01-effect-types.ts`

这个文件演示了六种 Effect 构造器，是理解 Effect 类型系统的入口。

**代码结构解析:**

**第 20-24 行 — Effect.succeed:**
```typescript
const succeedEffect: Effect.Effect<string> = Effect.succeed("Hello Effect!")
// 等价于: Effect.Effect<never, never, string>
```
`Effect.Effect<string>` 是 `Effect.Effect<never, never, string>` 的简写形式。当 R 和 E 都是 `never` 时，可以只指定 A 参数。`runSync` 直接返回成功值 `"Hello Effect!"`。

**第 34-40 行 — Effect.fail:**
```typescript
const failEffect: Effect.Effect<never, string> = Effect.fail("网络连接失败")
// 等价于: Effect.Effect<never, string, never>
```
`Effect.Effect<never, string>` 是 `Effect.Effect<never, string, never>` 的简写。注意这里用 `runPromiseExit` 而非 `runSync` 来获取结果 — 因为 `runSync` 遇到失败会直接抛出异常，而 `runPromiseExit` 将结果安全包装在 `Exit` 对象中。

**第 49-57 行 — Effect.sync:**
```typescript
const syncEffect = Effect.sync(() => {
  const result = 1 + 2 + 3
  return result
})
```
`sync` 假设函数不抛异常。类型为 `Effect<never, never, number>` — E=never 表示"从类型系统角度看，这个 Effect 不会失败"。

**第 67-83 行 — Effect.try:**
```typescript
const trySuccess = Effect.try({
  try: () => JSON.parse('{"name": "Alice", "age": 30}').name,
  catch: (err) => new Error(`JSON 解析失败: ${(err as Error).message}`),
})
```
`try` 使用 `{ try, catch }` 对象形式，允许自定义错误转换逻辑。成功时返回解析结果，失败时 `catch` 函数将原始异常转换为自定义 Error。类型为 `Effect<never, Error, string>` — E 固定为 `Error`。

**第 100-118 行 — Effect.tryPromise:**
```typescript
const tryPromiseEffect = Effect.tryPromise(() =>
  new Promise<string>((resolve, reject) =>
    setTimeout(() => {
      if (Math.random() > 0.2) resolve("异步数据获取成功")
      else reject(new Error("网络超时"))
    }, 100)
  )
)
```
`tryPromise` 将可能 reject 的 Promise 包装为 Effect。Promise reject 会被自动转为 `Effect.fail`。类型为 `Effect<never, Error, string>`。

**第 129-137 行 — Effect.promise:**
```typescript
const promiseEffect = Effect.promise(() =>
  Promise.resolve("这条 Promise 永远不会 reject")
)
```
`promise` 假设 Promise 不会 reject。类型为 `Effect<never, never, string>` — E=never。如果 Promise 意外 reject，异常会变成 defect。

**第 142-157 行 — 类型参数总结表:**
代码以表格形式总结了六种构造器的 R/E/A 参数模式，帮助记忆。

### 4.2 `02-pipe-and-flow.ts` — pipe 与 flow 组合

**运行:** `bun run src/02-pipe-and-flow.ts`

这个文件演示了 Effect 的组合与变换操作，是日常编写 Effect 代码的核心技能。

**代码结构解析:**

**第 20-26 行 — pipe 基础:**
```typescript
const result1 = pipe(
  5,
  (n: number) => n * 2,
  (n: number) => n + 3,
  (n: number) => `结果是 ${n}`
)
```
`pipe` 将数据从左到右依次传入函数链。每一步的类型自动推导，无需手动标注中间类型。

**第 36-44 行 — flow 基础:**
```typescript
const doubleThenAdd3 = flow(
  (n: number) => n * 2,
  (n: number) => n + 3,
  (n: number) => `结果是 ${n}`
)
```
`flow` 返回一个新函数而非立即执行。`doubleThenAdd3(5)` 和 `doubleThenAdd3(10)` 展示了复用能力。

**第 54-71 行 — Effect.map:**
```typescript
const getGreeting = pipe(
  fetchUserName,
  Effect.map((user) => user.name),
  Effect.map((name) => `你好, ${name}!`)
)
```
两次 `map` 链式变换：先提取 `name` 字段，再格式化为问候语。类型从 `Effect<never, never, {name, age}>` 变为 `Effect<never, never, string>` — 只有 A 变了。

**第 83-100 行 — Effect.flatMap:**
```typescript
const accessProgram = pipe(
  Effect.succeed(42),
  Effect.flatMap((id) => checkAccess(id))
)
```
`checkAccess` 返回 `Effect<never, string, string>`（可能失败）。`flatMap` 将新 Effect 的错误类型"提升"到管道中。注意 `accessProgramFail` 用 `runPromiseExit` 安全获取失败结果。

**第 110-117 行 — Effect.tap:**
```typescript
const withLogging = pipe(
  Effect.succeed({ name: "Bob", score: 95 }),
  Effect.tap((user) => Effect.sync(() => console.log("  [日志] 处理用户:", user.name))),
  Effect.map((user) => user.score),
  Effect.tap((score) => Effect.sync(() => console.log("  [日志] 分数:", score))),
  Effect.map((score) => score >= 60 ? "及格" : "不及格")
)
```
`tap` 在管道中插入日志副作用，但不改变流经的值。第一个 `tap` 之后值仍是 `{ name: "Bob", score: 95 }`，第二个 `tap` 之后值仍是 `95`。

**第 128-134 行 — Effect.andThen:**
```typescript
const sequential = pipe(
  Effect.sync(() => console.log("  步骤 1: 初始化完成")),
  Effect.andThen(Effect.sync(() => console.log("  步骤 2: 连接数据库"))),
  Effect.andThen(Effect.sync(() => console.log("  步骤 3: 启动服务"))),
  Effect.andThen(Effect.succeed("系统就绪"))
)
```
`andThen` 适合"步骤型"操作，每一步不依赖前一步的返回值。最终返回最后一个 Effect 的成功值 `"系统就绪"`。

### 4.3 `03-generator-syntax.ts` — Effect.gen 与 yield*

**运行:** `bun run src/03-generator-syntax.ts`

这个文件演示了 `Effect.gen` 生成器语法，这是编写复杂 Effect 程序最推荐的方式。

**代码结构解析:**

**第 42-54 行 — Effect.gen 基本语法:**
```typescript
const getUserReport = Effect.gen(function* () {
  const name = yield* fetchUserName(42)
  const score = yield* fetchUserScore(name)
  const grade = score >= 60 ? "及格" : "不及格"
  return { name, score, grade }
})
```
`yield*` 依次解包两个 Effect，获取 `name` 和 `score`。然后进行纯计算（判断及格），最后返回组合结果。整个流程读起来像同步代码，但类型系统在后台跟踪了所有错误类型。

**第 66-75 行 — 错误传播:**
```typescript
const failingProgram = Effect.gen(function* () {
  console.log("  开始执行...")
  const name = yield* fetchUserName(-1) // 这里会失败！
  console.log("  这行不会执行:", name)
  return "完成"
})
```
当 `yield* fetchUserName(-1)` 失败时，generator 在此处停止，后续代码不会执行。错误自动传播到 `Effect.gen` 的返回类型中。用 `runPromiseExit` 安全获取失败结果。

**第 86-100 行 — Effect.all 并发:**
```typescript
const [name1, name2, name3] = yield* Effect.all([
  fetchUserName(1),
  fetchUserName(2),
  fetchUserName(3),
])
```
三个 `fetchUserName` 调用**并发执行**，而非依次等待。全部成功后返回结果数组，通过解构赋值获取每个结果。

**第 110-120 行 — Effect.forEach 批量处理:**
```typescript
const names = yield* Effect.forEach(ids, (id) => fetchUserName(id))
```
对 5 个 ID 并发执行 `fetchUserName`，返回所有用户名组成的数组。

**第 127-143 行 — gen/yield* 与 async/await 对比表:**
代码以表格形式对比了两种语法在错误类型、依赖注入、并发、可取消、可重试、类型安全六个维度的差异。

### 4.4 `04-running-effects.ts` — 运行 Effect

**运行:** `bun run src/04-running-effects.ts`

这个文件演示了四种运行 Effect 的方式，是连接"Effect 世界"和"外部世界"的桥梁。

**代码结构解析:**

**第 17-46 行 — 准备测试 Effect:**
定义了三个测试用 Effect：`syncProgram`（纯同步）、`riskyProgram`（可能失败）、`asyncProgram`（异步）。这些 Effect 将在后续四种运行方式中分别使用。

**第 55-66 行 — Effect.runSync:**
```typescript
const syncResult = Effect.runSync(syncProgram)  // 成功: 30
try {
  Effect.runSync(riskyProgram)  // 可能抛出异常
} catch (err) { ... }
```
`runSync` 对 `syncProgram`（E=never）安全执行。对 `riskyProgram`（E=Error）使用 try/catch 包裹，因为 `runSync` 遇到失败会直接抛出异常。

**第 78-87 行 — Effect.runPromise:**
```typescript
Effect.runPromise(syncProgram).then(result => ...)
Effect.runPromise(riskyProgram).then(...).catch(err => ...)
Effect.runPromise(asyncProgram).then(result => ...)
```
`runPromise` 返回标准 Promise，可以用 `.then`/`.catch` 处理。注意 `asyncProgram` 的输出在最后才出现（因为包含 500ms 的异步延迟）。

**第 99-127 行 — Effect.runFork:**
```typescript
const fiber = Effect.runFork(
  Effect.gen(function* () {
    yield* Effect.tryPromise(() => new Promise(resolve => setTimeout(resolve, 300)))
    return "Fiber 结果"
  })
)
// 主线程不阻塞，立即继续
Effect.runPromise(Fiber.join(fiber)).then(result => ...)
```
`runFork` 立即返回 Fiber 对象，Effect 在后台执行。使用 `Fiber.join(fiber)` 等待 Fiber 完成并获取结果。注意：`Fiber.join` 是模块级函数，不是 fiber 对象的方法。

**第 137-158 行 — Effect.runPromiseExit:**
```typescript
Effect.runPromiseExit(syncProgram).then(exit => ...)   // Exit._tag === "Success"
Effect.runPromiseExit(riskyProgram).then(exit => ...)   // Exit._tag === "Failure"
```
`runPromiseExit` 无论成功还是失败都返回 `Exit` 对象，永不抛出异常。通过检查 `exit._tag` 来区分成功（`"Success"`）和失败（`"Failure"`）。

## 5. OpenCode 实战引用

OpenCode 项目中大量使用 `Effect.gen` 来组织服务操作。以下是两个典型场景：

### 5.1 服务初始化

在 `packages/opencode/src/session/prompt.ts` 中，服务 Layer 的创建使用 `Effect.gen`：

```typescript
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service      // 获取消息总线服务
    const status = yield* SessionStatus.Service  // 获取会话状态服务
    const sessions = yield* Session.Service      // 获取会话服务
    // ... 用这些依赖构建 Prompt 服务
  })
)
```

这里 `yield*` 不仅解包 Effect，还从上下文（Context）中**获取依赖服务**。这是 R 参数的实际应用 — 后续章节将详细讲解 Context 和 Layer 系统。

### 5.2 工具执行

在同一文件中，工具的执行函数也使用 `Effect.gen`：

```typescript
execute(args, options) {
  return run.promise(
    Effect.gen(function* () {
      const ctx = context(args, options)
      yield* plugin.trigger("tool.execute.before", ...)
      // ... 执行工具逻辑
    })
  )
}
```

这里展示了典型的"Effect 世界 → Promise 世界"桥接模式：内部用 `Effect.gen` 编写类型安全的逻辑，外层用 `run.promise`（即 `Effect.runPromise`）将结果转为 Promise 供外部系统调用。

这些模式将在后续章节中深入展开，本章只需建立对 `Effect.gen` 和 `yield*` 的基本认知。

## 6. 常见陷阱

### 陷阱 1: 混淆 Effect.tryPromise 和 Effect.promise

```typescript
// 错误: 用 promise 包装可能 reject 的 Promise
const bad = Effect.promise(() => fetch("/api/data").then(r => r.json()))
// 类型: Effect<never, never, any> — E=never 在说谎！

// 正确: 用 tryPromise 包装可能 reject 的 Promise
const good = Effect.tryPromise(() => fetch("/api/data").then(r => r.json()))
// 类型: Effect<never, Error, any> — E=Error 诚实反映了风险
```

**规则:** 除非你 100% 确定 Promise 不会 reject，否则始终使用 `tryPromise`。`promise` 的 E=never 是一个"承诺"，如果 Promise 实际 reject 了，这个承诺就被打破了，异常会变成 defect。

### 陷阱 2: 在 Effect.gen 中使用 await 而非 yield*

```typescript
// 错误: 在 gen 中使用 await
const bad = Effect.gen(function* () {
  const result = await somePromise  // 编译错误！gen 不是 async 函数
  return result
})

// 正确: 在 gen 中使用 yield*
const good = Effect.gen(function* () {
  const result = yield* Effect.tryPromise(() => somePromise)
  return result
})
```

**规则:** `Effect.gen` 创建的是 generator 函数，不是 async 函数。generator 中不能使用 `await`。如果需要在 gen 中使用 Promise，先用 `Effect.tryPromise` 将其转为 Effect，再用 `yield*` 解包。

### 陷阱 3: 认为 Effect.runSync 可以运行所有 Effect

```typescript
// 错误: 对异步 Effect 使用 runSync
const asyncEff = Effect.tryPromise(() => fetch("/api/data"))
Effect.runSync(asyncEff)  // 运行时错误！runSync 不能执行异步操作

// 正确: 对异步 Effect 使用 runPromise
Effect.runPromise(asyncEff).then(data => ...)
```

**规则:** `runSync` 只能运行纯同步的 Effect。如果 Effect 包含 `tryPromise`、`sleep`、或其他异步操作，必须使用 `runPromise` 或 `runFork`。

### 陷阱 4: 忘记 Effect 只是描述，不是执行

```typescript
// 常见误解: 以为创建 Effect 就会执行
const eff = Effect.sync(() => {
  console.log("这行不会在创建时打印")
  return 42
})
// 此时什么都没发生 — eff 只是一个不可变的值

// 只有调用运行函数时才执行
Effect.runSync(eff)  // 现在才打印 "这行不会在创建时打印"
```

**规则:** Effect 是惰性的（lazy）。创建 Effect 只是构建了一个计算描述，没有任何副作用发生。只有调用 `runSync`/`runPromise`/`runFork`/`runPromiseExit` 时才真正执行。这与 Promise 的热切（eager）执行模型根本不同。

## 7. 本章小结

本章建立了 Effect-TS 最核心的概念框架：

- **`Effect<R, E, A>` 是统一的计算描述类型**，三个参数分别表达依赖（R）、可恢复错误（E）、成功值（A）
- **六种构造器**覆盖了从同步到异步、从总是成功到总是失败的所有创建场景
- **`pipe` 和 `flow`** 是组合 Effect 的标准方式，`map`/`flatMap`/`tap`/`andThen` 是四个核心变换操作符
- **`Effect.gen` + `yield*`** 提供类 async/await 的编程体验，同时保留完整的类型安全
- **四种运行方式**（`runSync`/`runPromise`/`runFork`/`runPromiseExit`）覆盖了从同步脚本到生产服务的所有执行场景

掌握这些概念后，你已经能够编写基本的 Effect-TS 程序。从下一章开始，我们将逐步引入 Schema（数据校验）、Context（依赖注入）、Layer（依赖组装）等高级特性，构建完整的生产级应用。

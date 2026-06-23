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

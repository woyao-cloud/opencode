# 第 6 章：Scope — 资源生命周期管理

## 一、本章概述

Scope 是 Effect-TS 中管理资源生命周期的核心机制。在编写实际应用程序时，我们需要处理数据库连接、文件句柄、网络套接字等需要"获取-使用-释放"的资源。Scope 通过类型系统确保资源一定会被正确释放，消除资源泄漏的风险。

本章将介绍 Scope 的三个核心概念：

1. **acquireRelease** — 资源获取与释放的成对管理模式
2. **Scope.fork** — 子作用域的创建与资源隔离
3. **addFinalizer** — 终结器钩子的注册机制

最后，通过一个文件句柄管理实战示例，展示 Scope 在真实场景中的应用。

### 前置知识

- 第 2 章 Effect 基础：理解 `Effect`、`Effect.gen`、`Effect.runPromise`
- 第 4 章 Layer：了解依赖注入的基本概念

### 示例代码

所有示例位于 `docs/Effect-ts/demos/ch06-scope/src/`，可直接运行：

```bash
cd docs/Effect-ts/demos/ch06-scope
bun install
bun run demo:acquire    # acquireRelease 模式
bun run demo:fork       # Scope.fork 子作用域
bun run demo:finalizer  # addFinalizer 清理钩子
bun run demo:file       # 文件句柄管理实战
```

---

## 二、核心概念

### 2.1 什么是 Scope

Scope 是一个资源容器，它管理着一组资源的生命周期。当 Scope 关闭时，所有注册到该 Scope 的资源清理函数（finalizer）会被按 LIFO（后进先出）顺序执行。

```typescript
import { Effect, Scope } from "effect"

// Effect.scoped 创建一个 Scope 并执行 Effect
// Scope 在执行完成后自动关闭
const program = Effect.scoped(
  Effect.gen(function* () {
    // 在这个 Scope 中获取资源
    // Scope 关闭时，资源会被自动释放
  }),
)
```

### 2.2 Scope 的生命周期

```
┌──────────────────────────────────────────────┐
│  Scope 创建（Effect.scoped / Scope.make）      │
│  │                                            │
│  ├─ 资源获取（acquireRelease / addFinalizer）  │
│  │  ├─ 资源 1                                 │
│  │  ├─ 资源 2                                 │
│  │  └─ 子 Scope（Scope.fork）                  │
│  │     ├─ 子资源 A                            │
│  │     └─ 子资源 B                            │
│  │                                            │
│  └─ Scope 关闭                                │
│     ├─ 执行 finalizer 2（后注册先执行）          │
│     ├─ 执行 finalizer 1                       │
│     └─ 关闭所有子 Scope（递归释放子资源）        │
└──────────────────────────────────────────────┘
```

### 2.3 关键 API

| API | 类型签名 | 说明 |
|-----|---------|------|
| `Effect.acquireRelease` | `(acquire, release) => Effect<Scope \| R, E, A>` | 创建受 Scope 管理的资源 |
| `Scope.fork` | `(scope, strategy?) => Effect<Closeable>` | 从父 Scope 创建子 Scope |
| `Scope.use` | `(childScope) => (effect) => Effect` | 在子 Scope 中执行 Effect |
| `Effect.addFinalizer` | `(exit => Effect) => Effect<never, void, R\|Scope>` | 向当前 Scope 注册清理函数 |
| `Effect.scoped` | `(effect) => Effect<Exclude<R, Scope>, E, A>` | 提供 Scope 并移除 Scope 依赖 |
| `Scope.make` | `(strategy?) => Effect<Closeable>` | 手动创建 Scope |
| `Scope.close` | `(scope, exit) => Effect<void>` | 手动关闭 Scope |

---

## 三、acquireRelease — 资源获取与释放

### 3.1 基本模式

`acquireRelease` 将资源获取和释放逻辑配对，确保释放函数总是被调用：

```typescript
const managed = Effect.acquireRelease(
  // acquire: 获取资源
  Effect.sync(() => createResource()),
  // release: 释放资源（接收资源 + 退出状态）
  (resource, exit) => Effect.sync(() => releaseResource(resource)),
)
// 类型: Effect<Resource, Error, Scope.Scope>
```

返回值类型中的 `Scope.Scope` 表示这个 Effect 需要一个 Scope 上下文。它必须被包裹在 `Effect.scoped` 中或提供给已有的 Scope。

### 3.2 release 函数的第二个参数

release 函数接收两个参数：

- **第一个参数**：acquire 返回的资源
- **第二个参数**：`Exit.Exit<unknown, unknown>`，表示 Effect 的退出状态
  - `Exit.isSuccess(exit)` — Effect 成功完成
  - `Exit.isFailure(exit)` — Effect 以错误结束

这使你可以根据退出状态执行不同的清理逻辑（例如：回滚事务 vs 提交事务）。

### 3.3 示例：数据库连接管理

```typescript
import { Effect, Console, Scope, Exit } from "effect"

interface DbConnection {
  readonly id: number
  readonly query: (sql: string) => Effect.Effect<string, Error>
}

const acquireConnection: Effect.Effect<DbConnection, Error> = Effect.sync(() => {
  const id = generateId()
  Console.log(`[acquire] 打开连接 #${id}`)
  return { id, query: (sql) => Effect.succeed(`[#${id}] ${sql}`) }
})

const releaseConnection = (
  conn: DbConnection,
  exit: Exit.Exit<unknown, unknown>,
): Effect.Effect<void> =>
  Effect.sync(() => {
    const status = Exit.isSuccess(exit) ? "成功" : "失败"
    Console.log(`[release] 关闭连接 #${conn.id} (${status})`)
  })

const managedConnection = Effect.acquireRelease(acquireConnection, releaseConnection)

// 使用 Effect.scoped 提供 Scope
const program = Effect.scoped(
  Effect.gen(function* () {
    const conn = yield* managedConnection
    const result = yield* conn.query("SELECT 1")
    Console.log(result)
    // Scope 关闭时自动调用 releaseConnection
  }),
)
```

### 3.4 错误场景中的行为

即使 Effect 执行失败，release 函数仍然会被调用：

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const conn = yield* managedConnection
    yield* Effect.fail(new Error("操作失败"))
    // 这行不会执行，但 releaseConnection 仍然被调用
  }),
)
```

---

## 四、Scope.fork — 子作用域

### 4.1 子作用域的概念

`Scope.fork` 在当前 Scope 中创建一个子 Scope。子 Scope 的关键特性：

- **独立生命周期**：子 Scope 可以独立于父 Scope 关闭
- **错误隔离**：子 Scope 中的错误不会影响父 Scope
- **级联释放**：父 Scope 关闭时，所有子 Scope 也会被关闭
- **LIFO 顺序**：子 Scope 的资源按后进先出顺序释放

### 4.2 基本用法

在 beta.65 中，`Scope.fork` 分两步使用：
1. `Scope.fork(scope)` 从当前 Scope 创建一个子 Scope（Closeable）
2. `Scope.use(childScope)(effect)` 在子 Scope 中执行 Effect

```typescript
import { Effect, Console, Scope } from "effect"

const program = Effect.scoped(
  Effect.gen(function* () {
    // 获取当前 Scope
    const scope = yield* Scope.Scope

    // 父 Scope 中的资源
    const parentResource = yield* makeResource("父级")

    // 步骤 1: 创建子 Scope
    const childScope = yield* Scope.fork(scope)

    // 步骤 2: 在子 Scope 中执行任务
    yield* Scope.use(childScope)(
      Effect.gen(function* () {
        const childResource = yield* makeResource("子级")
        // ... 使用子资源 ...
        // 子 Scope 关闭 → 释放 childResource
      }),
    )

    // 子 Scope 已关闭，父资源仍可用
    yield* parentResource.doWork()
  }),
)
```

### 4.3 错误隔离

子 Scope 中的错误不会传播到父 Scope：

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const scope = yield* Scope.Scope
    const parentResource = yield* makeResource("父级")

    const childScope = yield* Scope.fork(scope)

    // 使用 Effect.exit 捕获子 Scope 的退出状态
    const childExit = yield* Effect.exit(
      Scope.use(childScope)(
        Effect.gen(function* () {
          yield* makeResource("子级")
          yield* Effect.fail(new Error("子任务失败"))
        }),
      ),
    )

    // 使用 Exit.match 模式匹配成功/失败
    const msg = Exit.match(childExit, {
      onSuccess: () => "子 Scope: 成功完成",
      onFailure: (_cause) => "子 Scope: 执行失败",
    })
    Console.log(`父 Scope: ${msg}`)

    // 父 Scope 不受影响，继续执行
    yield* parentResource.doWork()
  }),
)
```

### 4.4 嵌套子 Scope

可以创建多层嵌套的子 Scope，每一层独立管理自己的资源：

```typescript
const scope = yield* Scope.Scope
const outerChild = yield* Scope.fork(scope)

yield* Scope.use(outerChild)(
  Effect.gen(function* () {
    const outer = yield* makeResource("外层")

    // 在外层子 Scope 中再 fork 一个内层子 Scope
    const innerChild = yield* Scope.fork(outerChild)

    yield* Scope.use(innerChild)(
      Effect.gen(function* () {
        const inner = yield* makeResource("内层")
        // 内层 Scope 关闭 → 释放 inner
      }),
    )

    // inner 已释放，outer 仍可用
    // 外层 Scope 关闭 → 释放 outer
  }),
)
```

---

## 五、addFinalizer — 清理钩子

### 5.1 什么是 Finalizer

Finalizer 是一个注册到 Scope 的清理函数。当 Scope 关闭时，所有 finalizer 会按 LIFO 顺序执行。

与 `acquireRelease` 的区别：

| 特性 | acquireRelease | addFinalizer |
|------|---------------|--------------|
| 使用场景 | 需要配对"获取+释放"的资源 | 已有资源的清理逻辑 |
| 参数 | acquire Effect + release 函数 | `(exit: Exit) => Effect<void>` |
| 典型用途 | 数据库连接、文件句柄 | 临时文件清理、取消订阅、日志 |

### 5.2 基本用法

在 beta.65 中，`addFinalizer` 接收一个 `(exit) => Effect` 函数：

```typescript
import { Effect, Console } from "effect"

const program = Effect.scoped(
  Effect.gen(function* () {
    // 注册 finalizer（接收 Exit 参数）
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("清理资源")),
    )

    // 执行业务逻辑
    Console.log("执行业务...")

    // Scope 关闭时自动执行 finalizer
  }),
)
```

### 5.3 LIFO 执行顺序

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("第一个注册 — 最后执行")),
    )
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("第二个注册 — 第二个执行")),
    )
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => Console.log("第三个注册 — 最先执行")),
    )
    // Scope 关闭时输出顺序：3 → 2 → 1
  }),
)
```

### 5.4 与 acquireRelease 的组合

`acquireRelease` 内部也是通过 `addFinalizer` 实现的。两者可以组合使用：

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    // acquireRelease 管理主要资源
    const conn = yield* Effect.acquireRelease(
      Effect.sync(() => createConnection()),
      (conn) => Effect.sync(() => closeConnection(conn)),
    )

    // addFinalizer 添加额外的清理逻辑
    yield* Effect.addFinalizer((_exit) =>
      Effect.sync(() => recordMetrics()),
    )

    // Scope 关闭时：
    // 1. 先执行 addFinalizer（记录指标）— 后注册先执行
    // 2. 再执行 release（关闭连接）
  }),
)
```

---

## 六、实战：文件句柄管理

### 6.1 场景描述

文件操作是最常见的需要资源管理的场景。使用 Scope 可以确保：

1. 文件句柄不会泄漏（每个打开的文件都会被关闭）
2. 即使发生错误，文件也会被正确关闭
3. 多个文件操作可以共享一个 Scope

### 6.2 实现

```typescript
import { Effect, Scope, Exit } from "effect"
import * as fs from "node:fs"

interface FileHandle {
  readonly filePath: string
  readonly fd: number
  readonly read: () => Effect.Effect<string, Error>
  readonly write: (content: string) => Effect.Effect<void, Error>
}

const openFile = (filePath: string): Effect.Effect<FileHandle, Error, Scope.Scope> =>
  Effect.acquireRelease(
    // acquire: 打开文件
    Effect.try({
      try: () => {
        if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "")
        const fd = fs.openSync(filePath, "r+")
        return {
          filePath, fd,
          read: () => Effect.try(() => fs.readFileSync(filePath, "utf-8")),
          write: (c: string) => Effect.try(() => fs.writeFileSync(filePath, c)),
        }
      },
      catch: (e) => new Error(`打开文件失败: ${e}`),
    }),
    // release: 关闭文件
    (handle, exit) =>
      Effect.sync(() => {
        const status = Exit.isSuccess(exit) ? "成功" : "失败"
        fs.closeSync(handle.fd)
        Console.log(`[close] ${handle.filePath} (${status})`)
      }),
  )
```

### 6.3 基本使用

```typescript
const program = Effect.scoped(
  Effect.gen(function* () {
    const file = yield* openFile("/tmp/demo.txt")
    yield* file.write("Hello, Scope!")
    const content = yield* file.read()
    // Scope 关闭时自动关闭文件句柄
  }),
)
```

### 6.4 与 OpenCode 的联系

在 OpenCode 项目中，文件服务通过 Layer 提供依赖注入，而文件句柄的生命周期由 Scope 管理。这展示了 Scope 与 Layer 的典型组合模式：

- **Layer** 提供文件服务的依赖注入
- **Scope** 管理文件句柄的获取和释放
- 两者结合，实现完整的资源管理方案

---

## 七、小结

### 核心要点

1. **Scope 是资源生命周期的管理者**：它跟踪所有注册的资源，并在关闭时按 LIFO 顺序释放
2. **acquireRelease 是主要的资源管理模式**：将获取和释放配对，确保释放一定会被调用
3. **Scope.fork 提供资源隔离**：子 Scope 可以独立关闭，错误不会传播到父 Scope
4. **addFinalizer 提供灵活的清理机制**：适用于不需要显式获取的清理场景
5. **即使发生错误，资源也会被正确释放**：这是 Scope 的核心保证

### 最佳实践

- 始终使用 `Effect.scoped` 或 Layer 来管理需要 Scope 的 Effect
- 对于需要"获取-释放"配对的资源，使用 `acquireRelease`
- 对于只需要清理逻辑的场景，使用 `addFinalizer`
- 使用 `Scope.fork` 为独立的子任务创建资源隔离边界
- 注意 LIFO 执行顺序：后注册的 finalizer 先执行

### 下一章

第 7 章将介绍 Effect 的错误处理机制，包括 `Effect.catchAll`、`Effect.catchTag` 和 `Effect.retry` 等模式。

---

## 参考

- [Effect-TS Scope 文档](https://effect.website/docs/resource-management/scope)
- [Effect-TS acquireRelease API](https://effect.website/docs/resource-management/scope#acquirerelease)
- OpenCode 项目: `packages/opencode/src/file/index.ts` — Scope 文件管理实现

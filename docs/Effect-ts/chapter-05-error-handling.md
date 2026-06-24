# 第 5 章: 错误处理模型

## 本章目标

掌握 Effect-TS 的类型化错误处理模型。学完本章后，你将能够：

- 使用 `catchTag`、`catch`、`catchIf` 精确捕获不同类型的错误
- 理解 `Cause` 类型体系（`Fail` / `Die` / `Interrupt`）及其含义
- 使用 `retry` + `Schedule` 实现重试策略（固定间隔、指数退避）
- 使用 `catch` 和 `orElseSucceed` 实现降级与默认值恢复
- 使用 `Effect.exit` 将错误转为普通数据，实现部分失败容忍
- 理解 Effect 错误模型与传统 `try/catch` 的核心差异

## 前置知识

- **第 2 章 (Effect 基础)**: 理解 `Effect.gen`、`Effect.fail`、`Effect.succeed`、`Effect.pipe` 等基础操作
- **第 3 章 (Schema TaggedErrorClass)**: 理解 `Schema.Class` 定义带 `_tag` 的错误类型

## 概念讲解

### Effect 的错误模型

传统 `try/catch` 的错误处理有几个根本问题：

1. **错误类型不可见** — 函数签名 `Promise<User>` 看不出可能抛出什么错误
2. **类型丢失** — `catch` 子句中错误类型是 `unknown`，需要手动 `instanceof` 判断
3. **不可组合** — 嵌套的 `try/catch` 难以链式组合多个错误处理逻辑
4. **不可恢复** — `catch` 只能捕获，没有内置的重试或降级机制

Effect-TS 的错误模型从三个层面解决了这些问题：

#### 1. 类型化错误（Typed Errors）

每个 Effect 的类型签名都包含错误类型参数 `E`：

```typescript
Effect<never, NetworkError | AuthError, string>
//         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//         编译器知道这个 Effect 可能失败，且失败类型是这两种之一
```

编译器强制你处理所有声明的错误类型。未处理的错误会在类型层面暴露出来。

#### 2. 可恢复性（Recoverability）

Effect 区分两种错误：

- **Fail** — 预期的业务错误（如"用户不存在"、"校验失败"），可以通过 `catchTag` / `catch` 恢复
- **Die** — 非预期的缺陷（如空指针、内部状态不一致），不可通过常规错误处理恢复

这种区分让你可以安全地使用 `catch` 处理业务错误，同时让真正的 bug 继续向上传播。

#### 3. 可组合性（Composability）

错误处理逻辑通过 `pipe` 链式组合，而不是嵌套的 `try/catch`：

```typescript
fetchUser(id).pipe(
  Effect.catchTag("NetworkError", handleNetwork),
  Effect.catchTag("AuthError", handleAuth),
  Effect.retry(Schedule.exponential(Duration.millis(100))),
)
```

### Cause 类型体系

`Cause` 是 Effect 中表示"失败原因"的核心类型。一个 `Cause` 可以包含三种原因：

| 类型 | 含义 | 可恢复？ | 示例 |
|------|------|----------|------|
| `Cause.Fail` | 预期的业务错误 | 是 | 校验失败、用户不存在 |
| `Cause.Die` | 非预期的缺陷 | 否 | 空指针、内部状态不一致 |
| `Cause.Interrupt` | Fiber 被中断 | 否 | `Fiber.interrupt`、Scope 关闭 |

这三种原因可以组合（`Cause.combine`），形成一个错误树。例如，一个并发操作可能同时产生一个 `Fail` 和一个 `Die`。

### 恢复策略

Effect 提供四种主要的恢复策略：

| 策略 | 行为 | 结果类型变化 |
|------|------|-------------|
| `retry(schedule)` | 失败时按计划重试 | 错误类型不变 |
| `catch(fallback)` | 失败时切换到降级 Effect | `E` → `E2`（降级可能也有错误） |
| `orElseSucceed(val)` | 失败时返回默认值 | `E` → `never` |
| `exit` | 错误转为 `Exit` 数据 | `E` → `never`, `A` → `Exit<E, A>` |

## 代码示例

### 示例 1: 错误捕获模式

**文件**: `demos/ch05-error-handling/src/01-catch-patterns.ts`

这个文件演示了三种错误捕获 API 及其对类型签名的影响。

#### 定义带 `_tag` 的错误类型

```typescript
class NetworkError extends Schema.Class<NetworkError>("NetworkError")({
  _tag: Schema.Literal("NetworkError"),
  message: Schema.String,
  statusCode: Schema.Number,
}) {
  get description(): string {
    return `[网络错误 ${this.statusCode}] ${this.message}`
  }
}
```

每个错误类都包含一个 `_tag` 字面量字段，这是 `catchTag` 能够按标签匹配的基础。`Schema.Literal` 确保 `_tag` 的类型是精确的字符串字面量（如 `"NetworkError"`），而不是宽泛的 `string`。

#### Effect.catchTag — 按 `_tag` 精确捕获

```typescript
const result = yield* fetchUser(-1).pipe(
  Effect.catchTag("NetworkError", (err: NetworkError) =>
    Effect.succeed(`网络错误已处理: ${err.message} (状态码: ${err.statusCode})`)
  ),
)
```

`catchTag` 只捕获 `_tag` 匹配的错误。未匹配的错误继续向上传播。类型签名也会相应变化：

```
原始: Effect<never, NetworkError | AuthError, string>
catchTag("NetworkError") 后: Effect<never, AuthError, string>
```

`NetworkError` 从联合类型中被移除，`AuthError` 仍在。编译器知道 `AuthError` 尚未处理。

#### Effect.catch — 捕获所有错误

```typescript
const result = yield* validateData("").pipe(
  Effect.catch((err: ValidationError) =>
    Effect.succeed(`校验失败已处理: ${err.field} — ${err.message}`)
  ),
)
```

`catch` 捕获所有类型的错误，将 `E` 变为 `never` — 编译器知道所有错误都已处理。注意 beta.65 中 `catchAll` 已不存在，统一使用 `catch`。

#### Effect.catchIf — 选择性捕获

```typescript
const result = yield* fetchUser(0).pipe(
  Effect.catchIf(
    (err) => err._tag === "NetworkError" && err.statusCode >= 400 && err.statusCode < 500,
    (err) => Effect.succeed(`客户端错误已处理: ${err.message}`),
  ),
)
```

`catchIf(predicate, handler)` 只有 `predicate` 返回 `true` 时才处理错误。不匹配时错误继续传播。注意 beta.65 中 `catchSome` 已不存在，统一使用 `catchIf`。

### 示例 2: Cause 类型体系

**文件**: `demos/ch05-error-handling/src/02-cause-types.ts`

这个文件深入演示了 `Cause` 的三种原因类型及其检测方法。

#### Cause.Fail — 预期的业务错误

```typescript
const exit = yield* Effect.fail(new Error("数据库连接超时")).pipe(Effect.exit)
if (exit._tag === "Failure") {
  const cause = exit.cause
  console.log("hasFails:", Cause.hasFails(cause))
  console.log("错误信息:", Cause.pretty(cause))
}
```

`Cause.hasFails(cause)` 检查 Cause 中是否包含 `Fail` 类型的原因。`Cause.pretty(cause)` 将 Cause 格式化为人类可读的错误信息。

提取 `Fail` 原因使用 `Cause.findFail(cause)`，它返回一个 `Result` 类型，通过 `.success` 属性取值：

```typescript
const failResult = Cause.findFail(cause)
if (failResult._tag === "Success") {
  const failReason = failResult.success
  console.log("Fail error:", failReason.error.message)
}
```

#### Cause.Die — 非预期的缺陷

```typescript
const exit = yield* Effect.die(new Error("内部状态不一致 — 这是一个 bug")).pipe(Effect.exit)
if (exit._tag === "Failure") {
  const cause = exit.cause
  console.log("hasDies:", Cause.hasDies(cause))
  console.log("hasFails:", Cause.hasFails(cause))  // false
}
```

`Die` 表示程序中的 bug，不应该被常规错误处理捕获。关键区别：

- `Fail`: 可恢复的预期错误（`catchTag` / `catch` 可捕获）
- `Die`: 不可恢复的缺陷（`catchTag` / `catch` 不可捕获）

```typescript
// catch 无法捕获 Die
const program2b = Effect.die(new Error("致命缺陷")).pipe(
  Effect.catch((_err) => Effect.succeed("已恢复")),
)
// Die 仍然向上传播
```

#### Cause.Interrupt — Fiber 被中断

```typescript
const fiber = yield* Effect.sleep("3 seconds").pipe(Effect.fork)
yield* Fiber.interrupt(fiber)
const exit = yield* Fiber.await(fiber)

if (exit._tag === "Failure") {
  const cause = exit.cause
  if (Cause.hasInterruptsOnly(cause)) {
    console.log("确认为中断: 错误原因是 Interrupt")
  }
}
```

`Cause.hasInterruptsOnly(cause)` 检查 Cause 是否**只**包含中断原因。这在区分"被中断"和"执行失败"时非常有用。

#### Cause.combine — 多个错误组合

```typescript
const combinedCause = Cause.combine(
  Cause.combine(
    Cause.fail(new Error("第一步失败: 校验邮箱格式")),
    Cause.fail(new Error("第二步失败: 密码太短")),
  ),
  Cause.fail(new Error("第三步失败: 网络超时")),
)
```

`Cause.combine` 将多个错误组合成一个错误树。beta.65 中 `Cause.sequential` 和 `Cause.parallel` 已不存在，统一使用 `Cause.combine`。

#### Effect.catchCause — 用 Cause 信息做决策

```typescript
Effect.fail(new Error("暂时性错误")).pipe(
  Effect.catchCause((cause) => {
    if (Cause.hasFails(cause)) {
      const failResult = Cause.findFail(cause)
      if (failResult._tag === "Success") {
        const failReason = failResult.success
        if (failReason.error.message.includes("暂时性")) {
          return Effect.succeed("暂时性错误已恢复")
        }
      }
    }
    return Effect.fail(new Error("非暂时性错误，无法恢复"))
  }),
)
```

`catchCause` 让你访问完整的 `Cause` 对象，做出更细粒度的决策。这在需要根据错误的具体内容（而非类型）做判断时非常有用。

### 示例 3: 恢复策略

**文件**: `demos/ch05-error-handling/src/03-recovery-strategies.ts`

这个文件演示了四种恢复策略的具体用法。

#### Effect.retry — 使用 Schedule 控制重试

```typescript
let callCount = 0
const unstableService = Effect.gen(function* () {
  callCount++
  if (callCount < 3) {
    return yield* Effect.fail(new Error(`第 ${callCount} 次调用失败`))
  }
  return `第 ${callCount} 次调用成功!`
})

// 最多重试 5 次
const program1a = unstableService.pipe(
  Effect.retry(Schedule.recurs(5)),
)
```

`Schedule.recurs(5)` 创建一个最多重试 5 次的计划。如果 5 次后仍然失败，错误继续向上传播。

#### 指数退避重试

```typescript
const program2 = unstableService.pipe(
  Effect.retry(
    Schedule.exponential(Duration.millis(100)).pipe(
      Schedule.andThen(Schedule.recurs(3)),
    ),
  ),
)
```

`Schedule.exponential(Duration.millis(100))` 创建一个指数退避计划：第一次重试等待 100ms，第二次 200ms，第三次 400ms，以此类推。`Schedule.andThen(Schedule.recurs(3))` 限制最多重试 3 次。

#### Effect.catch — 降级方案

```typescript
const primaryService = (fail: boolean): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    if (fail) return yield* Effect.fail(new Error("主服务不可用"))
    return "主服务数据"
  })

const fallbackService = (): Effect.Effect<string> =>
  Effect.succeed("降级缓存数据")

// 主服务失败时使用降级服务
const program3a = primaryService(true).pipe(
  Effect.catch(() => fallbackService()),
)
```

`catch` 在失败时切换到降级 Effect。注意降级 Effect 可能也有自己的错误类型。beta.65 中 `orElse` 已不存在，统一使用 `catch` 实现降级。

#### Effect.orElseSucceed — 默认值

```typescript
const riskyOperation = (fail: boolean): Effect.Effect<number, Error> =>
  Effect.gen(function* () {
    if (fail) return yield* Effect.fail(new Error("计算失败"))
    return 42
  })

// 失败时返回默认值 0
const program4a = riskyOperation(true).pipe(
  Effect.orElseSucceed(() => 0),
)
```

`orElseSucceed` 将 `Effect<E, A>` 变为 `Effect<never, A>` — 错误类型被完全消除。这是最激进的恢复策略，适用于"有默认值兜底"的场景。

#### Effect.exit — 错误转为数据

```typescript
const mayFail = (fail: boolean): Effect.Effect<string, Error> =>
  Effect.gen(function* () {
    if (fail) return yield* Effect.fail(new Error("操作失败"))
    return "操作成功"
  })

// 失败的情况: Exit 包含 Failure
const program5a = mayFail(true).pipe(Effect.exit)
Effect.runPromise(program5a).then((exit) => {
  if (Exit.isFailure(exit)) {
    const causeOpt = Exit.getCause(exit)
    console.log("Exit.Failure — 错误:", causeOpt.value)
  }
})
```

`Effect.exit` 将 `Effect<E, A>` 转为 `Effect<never, Exit<E, A>>`。错误不再是"异常"，而是变成了普通数据。这在批量操作中特别有用：

```typescript
const items = [1, 2, -1, 3, -2]  // -1 和 -2 会失败
const batchProcess = Effect.all(
  items.map((n) => validateItem(n).pipe(Effect.exit)),
)
// 部分失败不影响整体 — 每个元素独立处理
```

beta.65 中 `Effect.either` 已不存在，统一使用 `Effect.exit`。

### 示例 4: Effect vs try/catch 对比

**文件**: `demos/ch05-error-handling/src/04-vs-try-catch.ts`

这个文件用同一个业务场景（获取用户数据并更新用户名）展示了两种错误处理方式的差异。

#### try/catch 方式

```typescript
async function updateUserNameTryCatch(userId: number, newName: string): Promise<User> {
  if (newName.length === 0) {
    throw new ValidationError({ _tag: "ValidationError", message: "用户名不能为空", field: "name" })
  }
  if (userId === 404) {
    throw new NotFoundError({ _tag: "NotFoundError", message: "用户记录不存在", userId })
  }
  if (userId === 403) {
    throw new PermissionError({ _tag: "PermissionError", message: "无权修改该用户" })
  }
  return { id: userId, name: newName, email: `user${userId}@test.com` }
}

// 调用时所有错误都是 unknown
try {
  const user = await updateUserNameTryCatch(1, "新名称")
} catch (error: unknown) {
  if (error instanceof ValidationError) { /* ... */ }
  else if (error instanceof NotFoundError) { /* ... */ }
  else if (error instanceof PermissionError) { /* ... */ }
  else { /* 未知错误 */ }
}
```

四个问题：
1. 类型签名 `Promise<User>` 看不出可能抛出什么错误
2. `catch` 中 `error` 是 `unknown`，需要手动 `instanceof`
3. `instanceof` 链容易遗漏错误类型
4. 无法组合重试、降级等恢复策略

#### Effect 方式

```typescript
function updateUserNameEffect(
  userId: number,
  newName: string,
): Effect.Effect<User, NotFoundError | PermissionError | ValidationError> {
  return Effect.gen(function* () {
    if (newName.length === 0) {
      return yield* Effect.fail(new ValidationError({ _tag: "ValidationError", message: "用户名不能为空", field: "name" }))
    }
    if (userId === 404) {
      return yield* Effect.fail(new NotFoundError({ _tag: "NotFoundError", message: "用户记录不存在", userId }))
    }
    if (userId === 403) {
      return yield* Effect.fail(new PermissionError({ _tag: "PermissionError", message: "无权修改该用户" }))
    }
    return { id: userId, name: newName, email: `user${userId}@test.com` }
  })
}

// 精确捕获
const result = await Effect.runPromise(
  updateUserNameEffect(1, "").pipe(
    Effect.catchTag("ValidationError", (err) =>
      Effect.succeed(`校验失败已处理: ${err.description}`),
    ),
  ),
)
```

四个优势：
1. 错误类型在签名中明确声明 — 类型签名即文档
2. `catchTag` 按 `_tag` 匹配，比 `instanceof` 更可靠
3. 编译器强制处理所有声明的错误类型
4. 错误处理逻辑通过 `pipe` 链式组合

## OpenCode 实战引用

在 OpenCode 项目中，`packages/opencode/src/effect/promise.ts` 展示了生产级的 Cause 处理模式：

```typescript
export function refineRejection<A, E>(
  evaluate: (signal: AbortSignal) => PromiseLike<A>,
  refine: (cause: unknown) => E | undefined,
) {
  return Effect.tryPromise(evaluate).pipe(
    Effect.catch((error) => {
      const cause = Cause.isUnknownError(error) ? error.cause : error
      const refined = refine(cause)
      if (refined !== undefined) return Effect.fail(refined)
      return Effect.die(cause)
    }),
  )
}
```

这个函数的核心模式是**错误分类**（error classification）：

1. **`Cause.isUnknownError` 判断** — 检查错误是否来自 Effect 的未知错误包装。`tryPromise` 捕获的 Promise rejection 会被包装为未知错误，需要先解包。

2. **提取原始 cause** — 如果是未知错误，通过 `error.cause` 获取原始错误对象；否则直接使用。

3. **细化分类** — 调用 `refine(cause)` 尝试将原始错误映射为已知的业务错误类型。如果 `refine` 返回了具体的错误实例，使用 `Effect.fail` 将其标记为预期的业务错误。

4. **不可识别则 Die** — 如果 `refine` 返回 `undefined`（无法识别），使用 `Effect.die` 将其标记为缺陷。这确保了未知错误不会意外地被 `catch` 吞掉。

这个模式在 OpenCode 中被广泛使用，例如将 HTTP 请求的原始错误（网络超时、DNS 解析失败等）分类为具体的业务错误类型，同时让真正的 bug（如 JSON 解析异常）以 `Die` 的形式暴露出来。

## 常见陷阱

### 陷阱 1: 过度使用 catch 吞掉重要错误

```typescript
// 错误: catch 会吞掉 Die 和 Interrupt
Effect.die(new Error("致命缺陷")).pipe(
  Effect.catch(() => Effect.succeed("已恢复")),
)
// Die 不会被 catch 捕获，但如果你在 catch 中做了日志记录，
// 可能会误以为所有错误都已处理
```

**解决方案**: 使用 `catchCause` 检查 Cause 类型，只处理 `Fail`：

```typescript
Effect.catchCause((cause) => {
  if (Cause.hasFails(cause)) {
    // 只处理 Fail 类型的错误
    return Effect.succeed("已恢复")
  }
  // Die 和 Interrupt 继续传播
  return Effect.failCause(cause)
})
```

### 陷阱 2: 忘记 Interrupt 也是错误

```typescript
// 错误: 假设所有 Failure 都是业务错误
const exit = yield* someEffect.pipe(Effect.exit)
if (Exit.isFailure(exit)) {
  // 这里可能是业务错误，也可能是 Fiber 被中断
  // 需要区分处理
}
```

**解决方案**: 使用 `Cause.hasInterruptsOnly` 或 `Cause.hasInterrupts` 检查：

```typescript
if (Exit.isFailure(exit)) {
  const cause = exit.cause
  if (Cause.hasInterruptsOnly(cause)) {
    console.log("Fiber 被中断，不是业务错误")
  } else if (Cause.hasFails(cause)) {
    console.log("业务错误，可以恢复")
  }
}
```

### 陷阱 3: 在 runPromise 周围使用 try/catch 而不是 catchTag

```typescript
// 错误: 在 Effect 外部用 try/catch 处理
try {
  await Effect.runPromise(mayFail())
} catch (error) {
  // error 是 unknown，失去了所有类型信息
  // 而且可能收到的是 Cause 对象，不是原始错误
}
```

**解决方案**: 在 Effect 内部使用 `catchTag` / `catch` 处理，让 `runPromise` 只处理成功路径：

```typescript
const result = await Effect.runPromise(
  mayFail().pipe(
    Effect.catchTag("NetworkError", handleNetwork),
    Effect.catchTag("AuthError", handleAuth),
  ),
)
```

### 陷阱 4: 混淆 catchTag 和 catch 的类型影响

```typescript
// catchTag 只移除匹配的错误类型
// catch 移除所有错误类型（E → never）

// 错误: 以为 catchTag 会处理所有错误
fetchUser(id).pipe(
  Effect.catchTag("NetworkError", handleNetwork),
  // 类型仍然是 Effect<never, AuthError, string>
  // AuthError 尚未处理！
)
```

**解决方案**: 理解每个 API 对类型签名的影响，让编译器帮你检查：

```typescript
fetchUser(id).pipe(
  Effect.catchTag("NetworkError", handleNetwork),
  Effect.catchTag("AuthError", handleAuth),
  // 类型变为 Effect<never, never, string>
  // 所有错误都已处理
)
```

## 本章小结

Effect-TS 的错误处理模型是对传统 `try/catch` 的全面升级：

1. **错误类型在签名中** — 每个 Effect 的 `E` 类型参数声明了可能发生的错误，编译器强制处理
2. **Cause 类型体系** — `Fail` / `Die` / `Interrupt` 三种原因类型，让你区分"可恢复的业务错误"和"不可恢复的缺陷"
3. **精确捕获** — `catchTag` 按 `_tag` 匹配，`catchIf` 按条件匹配，`catch` 捕获所有
4. **丰富的恢复策略** — `retry` + `Schedule` 实现重试，`catch` 实现降级，`orElseSucceed` 提供默认值，`exit` 将错误转为数据
5. **可组合** — 所有错误处理逻辑通过 `pipe` 链式组合，清晰且类型安全

核心原则：**让错误可见、可分类、可恢复**。Effect 的错误模型不是让你写更少的错误处理代码，而是让你写更安全、更可维护的错误处理代码。

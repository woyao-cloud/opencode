# EffectFlock — 文件锁服务
> 婧愭枃浠? `opencode/packages/core/src/util/effect-flock.ts`

## 概述

`EffectFlock` 是 OpenCode 的**基于文件系统的分布式锁服务**，利用 POSIX `mkdir` 的原子性实现跨进程互斥。它基于 Effect 框架实现，对外暴露为 Effect Service，用于防止并发写入配置、状态等共享文件时产生竞态条件。所有锁的获取都通过 `Scope` 绑定生命周期，并内置心跳机制防止持有者异常退出后锁永久残留。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `Global` | `@opencode-ai/core/global` | 全局状态目录，锁文件存放于 `<global.state>/locks/` 下 |
| `AppFileSystem` | `@opencode-ai/core/filesystem` | 文件系统抽象，目录创建、文件读写、状态查询、文件删除 |

```typescript
// effect-flock.ts layer 定义
export const layer: Layer.Layer<Service, never, Global.Service | AppFileSystem.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service      // 状态根目录
    const fs = yield* AppFileSystem.Service    // 文件系统操作
    // ...
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Global.layer),
)
```

此外，`EffectFlock` 还依赖 `Hash.fast`（来自 `../hash`）将锁的 `key` 字符串哈希为文件系统安全的锁目录名。

## 核心接口

```typescript
export interface Interface {
  readonly acquire: (key: string, dir?: string) => Effect.Effect<void, LockError, Scope.Scope>
  readonly withLock: {
    (key: string, dir?: string): <A, E, R>(body: Effect.Effect<A, E, R>) => Effect.Effect<A, E | LockError, R>
    <A, E, R>(body: Effect.Effect<A, E, R>, key: string, dir?: string): Effect.Effect<A, E | LockError, R>
  }
}
```

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("EffectFlock") {}
```

### 使用方式

通过 Effect 的 `Context` 机制注入，两种调用风格：

**`acquire` — 手动获取锁（Scope 管理生命周期）：**

```typescript
Effect.gen(function* () {
  yield* EffectFlock.Service.acquire("my-resource")
  // 锁在此 Scope 内持有，离开 Scope 自动释放
})
```

**`withLock` — 便捷包装器（自动管理 Scope）：**

```typescript
Effect.gen(function* () {
  // 双参数形式（body 在前）
  yield* EffectFlock.Service.withLock(
    Effect.sync(() => writeConfig()),
    "config-lock",
  )

  // 柯里化形式（key 在前）
  yield* pipe(
    Effect.sync(() => writeConfig()),
    EffectFlock.Service.withLock("config-lock"),
  )
})
```

两个参数都是可选的：
- `key`：锁的标识符，通过 `Hash.fast(key)` 哈希后生成锁目录名
- `dir`：锁文件存放目录，默认 `<global.state>/locks/`

## 数据结构

### 锁元数据 (LockMeta)

每个锁目录下写入 `meta.json`，记录持有者身份信息：

```typescript
const LockMetaJson = Schema.fromJsonString(
  Schema.Struct({
    token: Schema.String,       // 随机 UUID，用于释放时验证身份
    pid: Schema.Number,          // 持有者进程 PID
    hostname: Schema.String,     // 持有者主机名
    createdAt: Schema.String,    // 锁创建时间 (ISO 8601)
  }),
)
```

### 错误类型

```typescript
export type LockError = LockTimeoutError | LockCompromisedError

class LockTimeoutError extends Schema.TaggedErrorClass<LockTimeoutError>()("LockTimeoutError", {
  key: Schema.String,  // 超时的锁 key
}) {}

class LockCompromisedError extends Schema.TaggedErrorClass<LockCompromisedError>()("LockCompromisedError", {
  detail: Schema.String,  // 泄露原因（如 "heartbeat already existed"）
}) {}
```

内部错误（不暴露给调用方）：
- `ReleaseError` — 释放时元数据缺失、无效或 token 不匹配
- `NotAcquired` — 内部信号，表示锁当前被占用，驱动重试循环

### 锁目录结构

```
<lockRoot>/
  <hash(key)>.lock/          # 锁目录（mkdir 原子操作）
    meta.json                # 持有者身份信息
    heartbeat                 # 心跳文件（定时 touch）
  <hash(key)>.lock.breaker/   # 临时 breaker 目录（清理过期锁时使用）
```

## 关键实现细节

### 1. 基于 mkdir 的原子获取

锁的获取不依赖 `flock()` / `fcntl()` 等系统调用，而是利用 POSIX `mkdir` 的原子性：目录已存在时 `mkdir` 返回 `EEXIST`，多个进程同时创建同一目录时只有一个成功。这正是 `atomicMkdir` 函数的语义 —— 返回 `true` 表示成功创建（获取锁），`false` 表示目录已存在（锁被占用）。

```typescript
const atomicMkdir = (dir: string) =>
  fs.makeDirectory(dir, { mode: 0o700 }).pipe(
    Effect.as(true),
    Effect.catchIf(
      (e) => e.reason._tag === "AlreadyExists",
      () => Effect.succeed(false),
    ),
    Effect.orDie,
  )
```

### 2. 过期检测与 breaker 协议

锁可能在持有者异常退出后残留。通过以下机制清理：

- **过期判定** (`isStale`)：依次检查 heartbeat 文件、meta.json、锁目录本身的 `mtime`，任一超过 `STALE_MS`（60 秒）即为过期
- **Breaker 协议**：发现过期锁后，多个等待者通过创建 `<lockdir>.breaker` 目录竞标 breaker 所有权（同样是 `mkdir` 原子操作）。获得 breaker 的进程负责：**二次确认**过期状态 → 删除旧锁目录 → 重新创建
- **Breaker 清理**：breaker 目录也受过期机制保护 —— 如果 breaker 持有者异常退出，其他等待者会检测到 breaker 目录过期并清理

### 3. 心跳保活

锁持有期间，通过 `Effect.forkScoped` 启动一个后台 fiber，每 `HEARTBEAT_MS`（20 秒，即 `STALE_MS / 3`）调用 `fs.utimes` 更新 heartbeat 文件的修改时间。该 fiber 与锁 Scope 绑定，在锁释放前自动中断。

```typescript
yield* fs
  .utimes(handle.heartbeatPath, new Date(), new Date())
  .pipe(Effect.ignore, Effect.repeat(Schedule.spaced(HEARTBEAT_MS)), Effect.forkScoped)
```

### 4. 获取为不可中断、释放保证执行

锁获取通过 `Effect.acquireRelease` 实现：
- **acquire** 部分（`acquireHandle`）不可中断，防止获取过程中被取消导致锁目录残留
- **release** 部分（`release`）保证在 Scope 结束时执行，验证 token 后删除锁目录

### 5. 重试策略

获取失败（`NotAcquired`）时，使用指数退避重试：

```typescript
const retrySchedule = Schedule.exponential(BASE_DELAY_MS, 1.7).pipe(
  Schedule.either(Schedule.spaced(MAX_DELAY_MS)),
  Schedule.jittered,
  Schedule.while((meta) => meta.elapsed < TIMEOUT_MS),
)
```

- 初始延迟：100ms
- 增长因子：1.7x
- 最大延迟：2 秒（`either` 切换到固定间隔）
- 总超时：5 分钟（`TIMEOUT_MS`）
- 抖动：防止惊群效应
- 超时后抛出 `LockTimeoutError`

### 6. `withLock` 的 dual 函数签名

`withLock` 使用 `Function.dual` 实现两种调用形式：

```typescript
const withLock: Interface["withLock"] = Function.dual(
  (args) => Effect.isEffect(args[0]),        // 判断：第一个参数是 Effect 则为 body-first 形式
  <A, E, R>(body, key, dir?) => Effect.scoped(
    Effect.gen(function* () {
      yield* acquire(key, dir)
      return yield* body
    }),
  ),
)
```

## 关键设计决策

1. **mkdir 而非 flock**：选择 POSIX `mkdir` 原子性作为锁原语，而非系统级 `flock()` / `fcntl()`，因为 Effect 的文件系统抽象基于 Node.js `fs` 模块，`mkdir` 在所有平台上行为一致，无需平台特定实现

2. **Breaker 竞标协议**：过期锁的清理不是"谁发现谁清理"，而是通过 breaker 目录的二次 `mkdir` 竞标确保只有一个进程执行清理操作，防止多个等待者同时删除/重建锁目录导致的状态不一致

3. **二次确认（double-check）**：breaker 持有者在删除旧锁目录前会重新检查过期状态，因为从"发现过期"到"获得 breaker"之间存在时间窗口，原持有者可能在此期间恢复正常

4. **心跳而非租约**：使用定时 `utimes` 更新 heartbeat 文件的 mtime 作为活性信号，其他进程通过文件 mtime 与当前时间的差值判断持有者是否存活。心跳间隔设为 `STALE_MS / 3`，保证在过期判定前至少有一次更新机会

5. **Scope 绑定生命周期**：锁的获取和释放完全由 Effect `Scope` 管理 —— `acquire` 返回 `Effect<void, LockError, Scope>`，`withLock` 内部使用 `Effect.scoped`。这意味着锁在 Effect 程序正常退出、异常退出或 Scope 关闭时都会自动释放，不会泄漏

6. **不可中断的获取阶段**：`acquireHandle`（重试获取锁目录）是不可中断的，防止在创建锁目录后、写入 meta/heartbeat 前被取消。一旦获取成功进入持有阶段，心跳 fiber 和释放逻辑都由 Scope 保证执行

7. **固定时序参数**：所有时序参数（过期时间、超时时间、心跳间隔、重试策略）都是模块级常量，不暴露为配置项。设计假设这些值已经过充分验证，无需调用方调整

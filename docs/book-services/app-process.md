# @opencode/AppProcess — 进程管理服务
> 婧愭枃浠? `opencode/packages/core/src/process.ts`

## 概述

`@opencode/AppProcess` 是 OpenCode 的**子进程执行服务**，封装了 Effect 框架的 `ChildProcessSpawner`，提供 `run`（一次性执行并收集输出）和 `runStream`（流式逐行读取输出）两种进程调用方式。它支持 stdin 输入、超时控制、AbortSignal 中断、输出截断等特性，统一将错误包装为 `AppProcessError`。

### 依赖的 Services

| Service | 包 | 用途 |
|---------|-----|------|
| `ChildProcessSpawner` | `effect/unstable/process` | Effect 底层进程生成器，通过 `CrossSpawnSpawner` 实现 |
| `CrossSpawnSpawner` | `@opencode-ai/core/cross-spawn-spawner` | 基于 `cross-spawn` 的实现，处理跨平台命令执行和 shell 模式 |

```typescript
// process.ts layer 定义
export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner  // 唯一的 yield* 依赖
    // ...
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(CrossSpawnSpawner.defaultLayer))
```

`layer` 内部仅 `yield*` 了 `ChildProcessSpawner`；`defaultLayer` 将其具体实现绑定为 `CrossSpawnSpawner.defaultLayer`。

## 核心接口

```typescript
export type Interface = ChildProcessSpawner["Service"] & {
  readonly run: (
    command: ChildProcess.Command,
    options?: RunOptions,
  ) => Effect.Effect<RunResult, AppProcessError>

  readonly runStream: (
    command: ChildProcess.Command,
    options?: RunStreamOptions,
  ) => Stream.Stream<string, AppProcessError>
}
```

`Interface` 继承了 `ChildProcessSpawner["Service"]` 的所有方法（`spawn` 等），并额外提供两个高层方法：

- **`run`**：执行命令，等待完成，返回包含 stdout/stderr Buffer 的 `RunResult`
- **`runStream`**：执行命令，返回逐行解码的字符串 Stream，适合大输出或长时间运行的进程

### Service 声明

```typescript
export class Service extends Context.Service<Service, Interface>()("@opencode/AppProcess") {}
```

使用时通过 Effect 的 Context 机制注入：

```typescript
// 同步执行并获取结果
const result = yield* AppProcess.Service.run(
  ChildProcess.make("git", ["status"]),
)

// 流式读取输出
const lines = yield* AppProcess.Service.runStream(
  ChildProcess.make("tail", ["-f", "/var/log/app.log"]),
)
```

### 辅助函数

```typescript
// 要求退出码为 0，否则返回 AppProcessError
export const requireSuccess = (
  result: RunResult,
): Effect.Effect<RunResult, AppProcessError>

// 要求退出码在指定列表中，否则返回 AppProcessError
export const requireExitIn = (
  codes: ReadonlyArray<number>,
) => (result: RunResult): Effect.Effect<RunResult, AppProcessError>
```

典型用法：

```typescript
// 确保命令成功执行
yield* AppProcess.Service.run(cmd).pipe(Effect.flatMap(AppProcess.requireSuccess))

// 允许特定退出码（如 grep 的 0=匹配, 1=无匹配）
yield* AppProcess.Service.run(cmd).pipe(Effect.flatMap(AppProcess.requireExitIn([0, 1])))
```

## 数据结构

### AppProcessError

```typescript
export class AppProcessError extends Schema.TaggedErrorClass<AppProcessError>()(
  "AppProcessError",
  {
    command: Schema.String,          // 执行的命令描述（含参数）
    exitCode: Schema.optional(Schema.Number),  // 退出码（不一定存在）
    stderr: Schema.optional(Schema.String),    // 错误输出文本
    cause: Schema.optional(Schema.Defect),     // 底层错误原因
  },
) {}
```

### RunOptions — run() 的可选参数

```typescript
export interface RunOptions {
  readonly maxOutputBytes?: number      // stdout 最大字节数（超出截断）
  readonly maxErrorBytes?: number       // stderr 最大字节数（超出截断）
  readonly signal?: AbortSignal          // 外部中断信号
  readonly timeout?: Duration.Input      // 超时时间
  readonly stdin?: string | Uint8Array | Stream.Stream<Uint8Array, PlatformError>  // 标准输入
}
```

- `stdin` 仅支持 `StandardCommand`，传入 `PipedCommand` 会返回错误

### RunStreamOptions — runStream() 的可选参数

```typescript
export interface RunStreamOptions {
  readonly signal?: AbortSignal               // 外部中断信号
  readonly includeStderr?: boolean            // 是否将 stderr 合并到输出流中
  readonly okExitCodes?: ReadonlyArray<number> // 允许的退出码列表，不在其中的会作为流错误
  readonly maxErrorBytes?: number             // stderr 最大收集字节数
}
```

### RunResult — run() 的返回值

```typescript
export interface RunResult {
  readonly command: string           // 命令描述
  readonly exitCode: number          // 退出码
  readonly stdout: Buffer            // 标准输出（可能被截断）
  readonly stderr: Buffer            // 标准错误（可能被截断）
  readonly stdoutTruncated: boolean  // stdout 是否被截断
  readonly stderrTruncated: boolean  // stderr 是否被截断
}
```

## 关键实现细节

### 1. 命令描述 (describeCommand)

`describeCommand` 将 `ChildProcess.Command` 递归展开为人类可读的字符串：

```typescript
const describeCommand = (command: ChildProcess.Command): string => {
  if (command._tag === "StandardCommand") {
    return command.args.length
      ? `${command.command} ${command.args.join(" ")}`
      : command.command
  }
  // PipedCommand: 递归展开左右两侧，用 | 连接
  return `${describeCommand(command.left)} | ${describeCommand(command.right)}`
}
```

### 2. 错误包装 (wrapError)

所有底层错误统一包装为 `AppProcessError`。如果已经是 `AppProcessError` 则透传，否则创建新的：

```typescript
const wrapError = (description: string, cause: unknown): AppProcessError =>
  cause instanceof AppProcessError ? cause : new AppProcessError({ command: description, cause })
```

### 3. stdin 标准化 (normalizeStdin)

`run()` 接受三种 stdin 形式，内部统一转换为 `Stream<Uint8Array>`：

- `string` → `Stream.make(TextEncoder.encode(input))`
- `Uint8Array` → `Stream.make(input)`
- `Stream` → 直接使用

仅对 `StandardCommand` 生效；`PipedCommand` 不支持 stdin。

### 4. 流收集与截断 (collectStream)

```typescript
const collectStream = (stream, maxOutputBytes) =>
  Stream.runFold(stream, () => ({ chunks: [], bytes: 0, truncated: false }),
    (acc, chunk) => {
      if (maxOutputBytes === undefined) { /* 无限制追加 */ }
      const remaining = maxOutputBytes - acc.bytes
      if (remaining > 0) acc.chunks.push(
        remaining >= chunk.length ? chunk : chunk.slice(0, remaining)
      )
      acc.bytes += chunk.length
      acc.truncated = acc.truncated || acc.bytes > maxOutputBytes
      return acc
    },
  ).pipe(Effect.map(x => ({ buffer: Buffer.concat(x.chunks), truncated: x.truncated })))
```

- 未设置 `maxOutputBytes` 时无限收集
- 设置后，chunk 超出剩余容量时切片截断
- `truncated` 标记一旦为 `true` 就不再回退

### 5. run() 的执行流程

```
run(command, options?)
  ├── stdin 为 undefined → 直接 spawn 并 collect
  ├── stdin 有值且为 StandardCommand → 用 normalizeStdin 构造新 command，再 spawn
  ├── stdin 有值且为 PipedCommand → 直接返回 AppProcessError
  └── 输出包装:
       ├── timeout 选项 → Effect.timeoutOrElse，超时返回 "Timed out" AppProcessError
       ├── signal 选项 → Effect.raceFirst(waitForAbort)，先中断者胜
       └── 最终 catch → wrapError 兜底
```

`run()` 使用 `Effect.scoped` 管理进程句柄生命周期，确保进程退出后资源释放。

### 6. runStream() 的执行流程

```
runStream(command, options?)
  ├── spawn 进程
  ├── forkScoped 收集 stderr（用于失败时的错误信息）
  ├── 按 includeStderr 选择数据源（handle.all 或 handle.stdout）
  ├── decodeText → splitLines → filter empty lines → 产出字符串流
  ├── 尾部 Stream:
  │    └── 等待 exitCode
  │         ├── okExitCodes 有值且 exitCode 不在其中 → 失败，附带 stderr
  │         └── 否则 → Stream.empty
  ├── Stream.concat(lines, tail) 连接
  └── catch + interruptWhen(signal) 错误处理与中断
```

`runStream` 返回 `Stream` 而非 `Effect`，适合逐行消费大输出。`okExitCodes` 检查在流结束后（进程退出时）触发，不在流开始时就报错。

### 7. AbortSignal 处理 (waitForAbort)

```typescript
const waitForAbort = (signal: AbortSignal) =>
  Effect.callback<never, Error>((resume) => {
    if (signal.aborted) {
      resume(Effect.fail(abortError(signal)))
      return
    }
    const onabort = () => resume(Effect.fail(abortError(signal)))
    signal.addEventListener("abort", onabort, { once: true })
    return Effect.sync(() => signal.removeEventListener("abort", onabort))
  })
```

- 如果 signal 已经 aborted，立即失败
- 否则注册一次性 `abort` 事件监听器
- 返回清理函数用于事件注销

### 8. defaultLayer 构成

```typescript
export const defaultLayer = layer.pipe(Layer.provide(CrossSpawnSpawner.defaultLayer))
```

`CrossSpawnSpawner` 是 `ChildProcessSpawner` 的跨平台实现，基于 `cross-spawn` npm 包，处理 Windows 上的 `.cmd`/`.bat` 扩展名解析、shell 模式差异等平台兼容问题。

## 关键设计决策

1. **继承 ChildProcessSpawner 接口**：`Interface` 类型定义为 `ChildProcessSpawner["Service"] & { run, runStream }`，这意味着 `Service` 实例可以当作 spawner 直接使用（`Service.of({ ...spawner, run, runStream })`），同时提供高层封装。调用方无需分别注入 spawner 和 AppProcess。

2. **两种执行模式分离**：`run` 返回 `Effect<RunResult>` 适合短命令，一次性收集 stdout/stderr 到 Buffer；`runStream` 返回 `Stream<string>` 适合长运行进程，逐行消费输出。两者不互相调用，各自独立实现。

3. **统一错误类型 AppProcessError**：所有底层错误（超时、中断、非零退出码、spawn 失败）都通过 `wrapError` 统一包装为 `AppProcessError`，调用方只需处理一种错误类型。已有的 `AppProcessError` 实例会被透传，避免嵌套包装。

4. **截断标记而非丢弃**：`RunResult` 包含 `stdoutTruncated` 和 `stderrTruncated` 布尔标记，而非静默丢弃超出部分。调用方可以据此决定是否需要重试或告警。

5. **okExitCodes 延迟检查**：`runStream` 中退出码检查在进程退出后才触发（tail Stream），而非在 spawn 时立即验证。这确保了流中的所有行都能被消费完毕，然后才根据退出码决定是否报错。

6. **stdin 仅限 StandardCommand**：`run()` 的 stdin 选项明确拒绝 `PipedCommand`（管道命令），因为管道由多个子进程组成，stdin 只能注入到第一个进程，语义不清晰。调用方需要将管道拆分为独立调用或使用 shell 模式。

7. **Effect.scoped 管理进程生命周期**：`run()` 使用 `Effect.scoped` 确保进程句柄（handle）在 collect 完成后正确释放，不会泄漏系统资源。

8. **CrossSpawnSpawner 作为默认实现**：通过 `Layer.provide(CrossSpawnSpawner.defaultLayer)` 绑定，使用 `cross-spawn` 处理 Windows 兼容性（如 `.cmd` 文件执行需要 `cmd.exe /c` 包装），而非 Node.js 原生 `child_process.spawn`。

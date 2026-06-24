# ch11-fiber — Fiber 并发执行单元

Fiber 是 Effect-TS 中轻量级并发执行单元，类似于操作系统线程但开销极低。本章通过四个场景深入理解 Fiber 的核心概念：

- **Fiber vs Promise** — 理解 Fiber 与 Promise 的本质区别：惰性创建、可取消、结构化并发
- **Fork / Join / Interrupt** — Fiber 的创建、等待、中断、轮询等操作
- **Fiber 生命周期** — 从 Suspended 到 Running 到 Done 的状态转换
- **结构化并发** — 使用 Scope 管理 Fiber 生命周期，自动清理

## 安装

```bash
cd docs/Effect-ts/demos/ch11-fiber
bun install
```

## 运行

```bash
# 场景 1: Fiber vs Promise
bun run demo:vs-promise

# 场景 2: Fork / Join / Interrupt
bun run demo:fork-join

# 场景 3: Fiber 生命周期
bun run demo:lifecycle

# 场景 4: 结构化并发
bun run demo:structured
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-fiber-vs-promise.ts` | Fiber vs Promise：创建时机、取消能力、结构化并发对比 |
| `src/02-fork-join-interrupt.ts` | fork / join / interrupt / interruptAs / await / poll 操作 |
| `src/03-lifecycle.ts` | Fiber 状态（Suspended→Running→Done）、status / map / orElse / zip |
| `src/04-structured-concurrency.ts` | forkIn(scope) / Scope 自动清理 / 简化版任务管理器 |

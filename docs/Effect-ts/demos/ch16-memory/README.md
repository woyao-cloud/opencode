# ch16-memory — 内存管理

Effect-TS 程序的内存管理：

- **闭包引用链** — Effect 闭包中的内存引用、flatMap 链的内存累积、Effect.gen 的变量生命周期
- **Scope 释放时机** — acquireRelease 的 LIFO 释放、addFinalizer 顺序、Scope.fork 子作用域内存隔离
- **Fiber 泄漏检测** — forkDaemon 泄漏、未 join 的 Fiber、Scope 自动中断、WeakRef 检测
- **Stream 缓冲控制** — bufferChunks 容量、grouped 批量大小、背压内存、Stream 生命周期
- **Layer 生命周期** — Layer 初始化/销毁、Layer.fresh 隔离、内存占用对比

## 安装

```bash
cd docs/Effect-ts/demos/ch16-memory
bun install
```

## 运行

```bash
# 场景 1: 闭包引用链 — Effect flatMap 链内存累积 vs Effect.gen
bun run demo:closure

# 场景 2: Scope 释放 — 释放时机、LIFO 顺序、子作用域隔离
bun run demo:scope

# 场景 3: Fiber 泄漏 — forkDaemon 泄漏、Scope 自动回收、WeakRef 检测
bun run demo:fiber

# 场景 4: Stream 缓冲 — buffer 容量、grouped 批量、背压内存
bun run demo:stream

# 场景 5: Layer 生命周期 — 初始化/销毁、Layer.fresh、内存占用
bun run demo:layer
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-closure-chains.ts` | Effect 闭包链：flatMap 链中的闭包累积、Effect.gen 的变量生命周期、提前释放引用 |
| `src/02-scope-release.ts` | Scope 释放：acquireRelease LIFO 顺序、addFinalizer 时机、Scope.fork 子作用域内存隔离 |
| `src/03-fiber-leak.ts` | Fiber 泄漏：forkDaemon 泄漏检测、未 join 的 Fiber、Scope 自动回收、WeakRef 验证 |
| `src/04-stream-buffer.ts` | Stream 缓冲：bufferChunks 容量控制、grouped 批量大小、Stream 生命周期释放 |
| `src/05-layer-lifecycle.ts` | Layer 生命周期：Layer 初始化/销毁时机、Layer.fresh 隔离、内存占用对比 |

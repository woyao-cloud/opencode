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

```bash
git add docs/Effect-ts/chapter-02-effect-basics.md docs/Effect-ts/demos/ch02-effect-basics/
git commit -m "docs: Effect-TS book chapter 2 - Effect Basics"
```

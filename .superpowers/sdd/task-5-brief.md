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

```json
{
  "name": "ch05-error-handling",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:catch": "bun run src/01-catch-patterns.ts",
    "demo:cause": "bun run src/02-cause-types.ts",
    "demo:recovery": "bun run src/03-recovery-strategies.ts",
    "demo:vs-trycatch": "bun run src/04-vs-try-catch.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2: 编写 01-catch-patterns.ts — catchTag / catchAll / catchSome**

演示:
- `Effect.catchTag(tag, handler)` — 按错误类型捕获（注意：4.0.0-beta.65 使用 `Effect.catchTag`，不是 `Effect.catchTags`）
- `Effect.catchAll(handler)` — 捕获所有错误
- `Effect.catchSome(partialHandler)` — 选择性捕获
- 错误处理后类型签名的变化

- [ ] **Step 3: 编写 02-cause-types.ts — Cause 类型体系**

演示:
- `Cause.Fail` — 预期的业务错误
- `Cause.Die` — 非预期的缺陷（bug）
- `Cause.Interrupt` — Fiber 被中断
- `Cause.Sequential` — 顺序错误组合
- `Cause.Parallel` — 并发错误组合
- `Cause.pretty` — 格式化错误信息

- [ ] **Step 4: 编写 03-recovery-strategies.ts — 错误恢复策略**

演示:
- `Effect.retry({ times: 3 })` — 简单重试
- `Effect.retry(effect, schedule)` — 使用 Schedule 控制重试
- `Effect.orElse(fallback)` — 失败时降级
- `Effect.orElseSucceed(defaultValue)` — 失败时返回默认值
- `Effect.either` — 将错误转为 Either 类型

- [ ] **Step 5: 编写 04-vs-try-catch.ts — 与 try/catch 思维对比**

演示:
- try/catch: 错误类型是 unknown，需要 instanceof 判断
- Effect: 错误类型在签名中，编译器强制处理
- 同一个场景两种写法的并排对比

- [ ] **Step 6: 编写 chapter-05-error-handling.md**

按七段式结构，重点:
- 概念讲解: Effect 的错误模型 = 类型化 + 可恢复 + 可组合
- OpenCode 实战引用: `effect/promise.ts` 的 Cause 处理
- 常见陷阱: 过度使用 catchAll 吞没重要错误；忘记 Interrupt 也是一种错误

- [ ] **Step 7: 验证 + 提交**

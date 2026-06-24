### Task 10: 第 10 章 — Effect 模式集锦

**Files:**
- Create: `docs/Effect-ts/chapter-10-effect-patterns.md`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/package.json`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/README.md`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/01-retry-schedule.ts`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/02-timeout-race.ts`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/03-batch-operations.ts`
- Create: `docs/Effect-ts/demos/ch10-effect-patterns/src/04-cache-once.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 5 章 错误处理
- Produces: Effect 模式集锦 + 4 个可运行示例

```json
{
  "name": "ch10-effect-patterns",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:retry": "bun run src/01-retry-schedule.ts",
    "demo:timeout": "bun run src/02-timeout-race.ts",
    "demo:batch": "bun run src/03-batch-operations.ts",
    "demo:cache": "bun run src/04-cache-once.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **编写 4 个 demo .ts 文件** (retry+Schedule, timeout+race, batch operations, cache+once)
- [ ] **编写 chapter-10-effect-patterns.md** (七段式结构)
- [ ] **验证 + 提交**: `git commit -m "docs: Effect-TS book chapter 10 - Effect Patterns"`

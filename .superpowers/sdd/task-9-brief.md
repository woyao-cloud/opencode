### Task 9: 第 9 章 — Schema 进阶：复杂数据建模

**Files:**
- Create: `docs/Effect-ts/chapter-09-schema-advanced.md`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/package.json`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/README.md`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/01-union-literal.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/02-transform.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/03-extend-omit.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/04-recursive.ts`
- Create: `docs/Effect-ts/demos/ch09-schema-advanced/src/05-api-types.ts`

**Interfaces:**
- Consumes: 第 3 章 Schema 基础
- Produces: Schema 进阶 + 5 个可运行示例
- OpenCode 参考: `packages/llm/src/schema/events.ts` — LLM 事件 Schema 体系

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch09-schema-advanced",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:union": "bun run src/01-union-literal.ts",
    "demo:transform": "bun run src/02-transform.ts",
    "demo:extend": "bun run src/03-extend-omit.ts",
    "demo:recursive": "bun run src/04-recursive.ts",
    "demo:api": "bun run src/05-api-types.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2-6: 编写 5 个 demo .ts 文件** (Union/Literal, Transform, Extend/Omit, Recursive, API Types)
- [ ] **Step 7: 编写 chapter-09-schema-advanced.md** (七段式结构)
- [ ] **Step 8: 验证 + 提交**

```bash
cd docs/Effect-ts/demos/ch09-schema-advanced && bun install
bun run src/01-union-literal.ts && bun run src/02-transform.ts && bun run src/03-extend-omit.ts && bun run src/04-recursive.ts && bun run src/05-api-types.ts
git add docs/Effect-ts/chapter-09-schema-advanced.md docs/Effect-ts/demos/ch09-schema-advanced/
git commit -m "docs: Effect-TS book chapter 9 - Schema Advanced"
```

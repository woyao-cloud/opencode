### Task 8: 第 8 章 — Layer 进阶：复杂依赖图

**Files:**
- Create: `docs/Effect-ts/chapter-08-layer-advanced.md`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/package.json`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/README.md`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/01-dynamic-layer.ts`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/02-conditional.ts`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/03-multi-layer-arch.ts`
- Create: `docs/Effect-ts/demos/ch08-layer-advanced/src/04-test-replacement.ts`

**Interfaces:**
- Consumes: 第 4 章 Layer 基础, 第 7 章 Config
- Produces: Layer 进阶 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/project/instance-layer.ts` — `Layer.unwrap` 动态加载

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch08-layer-advanced",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:dynamic": "bun run src/01-dynamic-layer.ts",
    "demo:conditional": "bun run src/02-conditional.ts",
    "demo:multi": "bun run src/03-multi-layer-arch.ts",
    "demo:test": "bun run src/04-test-replacement.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2-5: 编写 4 个 demo .ts 文件** (动态Layer, 条件注入, 多层架构, 测试替换)
- [ ] **Step 6: 编写 chapter-08-layer-advanced.md** (七段式结构)
- [ ] **Step 7: 验证 + 提交**

```bash
cd docs/Effect-ts/demos/ch08-layer-advanced && bun install
bun run src/01-dynamic-layer.ts && bun run src/02-conditional.ts && bun run src/03-multi-layer-arch.ts && bun run src/04-test-replacement.ts
git add docs/Effect-ts/chapter-08-layer-advanced.md docs/Effect-ts/demos/ch08-layer-advanced/
git commit -m "docs: Effect-TS book chapter 8 - Layer Advanced"
```

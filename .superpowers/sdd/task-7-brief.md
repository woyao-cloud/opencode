### Task 7: 第 7 章 — Config 配置管理

**Files:**
- Create: `docs/Effect-ts/chapter-07-config.md`
- Create: `docs/Effect-ts/demos/ch07-config/package.json`
- Create: `docs/Effect-ts/demos/ch07-config/README.md`
- Create: `docs/Effect-ts/demos/ch07-config/src/01-basic-config.ts`
- Create: `docs/Effect-ts/demos/ch07-config/src/02-provider.ts`
- Create: `docs/Effect-ts/demos/ch07-config/src/03-composition.ts`
- Create: `docs/Effect-ts/demos/ch07-config/src/04-runtime-flags-pattern.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 4 章 Layer
- Produces: Config 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/effect/runtime-flags.ts` — 完整 Config + Layer 模式

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch07-config",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:basic": "bun run src/01-basic-config.ts",
    "demo:provider": "bun run src/02-provider.ts",
    "demo:compose": "bun run src/03-composition.ts",
    "demo:flags": "bun run src/04-runtime-flags-pattern.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2-5: 编写 4 个 demo .ts 文件** (Config基础, ConfigProvider, 组合验证, RuntimeFlags模式)
- [ ] **Step 6: 编写 chapter-07-config.md** (七段式结构)
- [ ] **Step 7: 验证 + 提交**

```bash
cd docs/Effect-ts/demos/ch07-config && bun install
bun run src/01-basic-config.ts && bun run src/02-provider.ts && bun run src/03-composition.ts && bun run src/04-runtime-flags-pattern.ts
git add docs/Effect-ts/chapter-07-config.md docs/Effect-ts/demos/ch07-config/
git commit -m "docs: Effect-TS book chapter 7 - Config"
```

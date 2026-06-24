### Task 6: 第 6 章 — Scope 资源生命周期管理

**Files:**
- Create: `docs/Effect-ts/chapter-06-scope.md`
- Create: `docs/Effect-ts/demos/ch06-scope/package.json`
- Create: `docs/Effect-ts/demos/ch06-scope/README.md`
- Create: `docs/Effect-ts/demos/ch06-scope/src/01-acquire-release.ts`
- Create: `docs/Effect-ts/demos/ch06-scope/src/02-scope-fork.ts`
- Create: `docs/Effect-ts/demos/ch06-scope/src/03-finalizer.ts`
- Create: `docs/Effect-ts/demos/ch06-scope/src/04-file-handle-demo.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础, 第 4 章 Layer
- Produces: Scope 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/file/index.ts` — 文件句柄 Scope 管理

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch06-scope",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:acquire": "bun run src/01-acquire-release.ts",
    "demo:fork": "bun run src/02-scope-fork.ts",
    "demo:finalizer": "bun run src/03-finalizer.ts",
    "demo:file": "bun run src/04-file-handle-demo.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2: 编写 01-acquire-release.ts — acquireRelease 模式**
- [ ] **Step 3: 编写 02-scope-fork.ts — Scope.fork 子作用域**
- [ ] **Step 4: 编写 03-finalizer.ts — addFinalizer 清理钩子**
- [ ] **Step 5: 编写 04-file-handle-demo.ts — 文件句柄管理实战**
- [ ] **Step 6: 编写 chapter-06-scope.md**
- [ ] **Step 7: 验证 + 提交**

```bash
cd docs/Effect-ts/demos/ch06-scope && bun install
bun run src/01-acquire-release.ts && bun run src/02-scope-fork.ts && bun run src/03-finalizer.ts && bun run src/04-file-handle-demo.ts
git add docs/Effect-ts/chapter-06-scope.md docs/Effect-ts/demos/ch06-scope/
git commit -m "docs: Effect-TS book chapter 6 - Scope"
```

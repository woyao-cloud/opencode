### Task 4: 第 4 章 — Context 与 Layer 依赖注入

**Files:**
- Create: `docs/Effect-ts/chapter-04-context-layer.md`
- Create: `docs/Effect-ts/demos/ch04-context-layer/package.json`
- Create: `docs/Effect-ts/demos/ch04-context-layer/README.md`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/01-context-tag.ts`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/02-layer-basics.ts`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/03-provide-patterns.ts`
- Create: `docs/Effect-ts/demos/ch04-context-layer/src/04-layer-composition.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础
- Produces: Context + Layer 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/opencode/src/effect/runtime-flags.ts` — `Context.Service` + `Layer` 模式

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch04-context-layer",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:tag": "bun run src/01-context-tag.ts",
    "demo:layer": "bun run src/02-layer-basics.ts",
    "demo:provide": "bun run src/03-provide-patterns.ts",
    "demo:compose": "bun run src/04-layer-composition.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2: 编写 01-context-tag.ts — Context.Tag 声明服务接口**

演示:
- `Context.GenericTag<InterfaceType>()("ServiceName")` 声明服务（注意：Effect 4.0.0-beta.65 使用 GenericTag，不是 Tag）
- `Effect.gen` 中 `yield* ServiceTag` 获取服务实例
- 无 Layer 提供时运行报错（展示 MissingService 错误）

- [ ] **Step 3: 编写 02-layer-basics.ts — Layer 构建依赖图**

演示:
- `Layer.succeed(tag, instance)` — 提供固定值
- `Layer.sync(tag, () => instance)` — 同步构建
- `Layer.effect(tag, Effect.gen(...))` — 异步构建
- `Layer.scoped(tag, Effect.acquireRelease(...))` — 带资源管理的构建
- `Layer.provide(layer, dependency)` — 满足 Layer 的依赖

- [ ] **Step 4: 编写 03-provide-patterns.ts — Effect.provide 注入模式**

演示:
- `Effect.provide(effect, layer)` — 基础注入
- `Effect.provideService(effect, tag, instance)` — 直接提供实例
- `Effect.provideServiceEffect(effect, tag, Effect)` — 异步提供
- `Layer.provideMerge` — 合并 Layer
- 注入范围: 局部 provide vs 全局 Layer

- [ ] **Step 5: 编写 04-layer-composition.ts — Layer 组合模式**

演示:
- `Layer.merge(layerA, layerB)` — 合并两个独立 Layer
- `Layer.provide(layer, dependency)` — 满足依赖
- `Layer.flatMap` — 动态构建依赖链
- 构建一个三层依赖的服务体系: Config → Database → UserService

- [ ] **Step 6: 编写 chapter-04-context-layer.md**

按七段式结构，重点:
- 概念讲解: DI 的本质是"声明需要什么"而非"自己去拿"
- OpenCode 实战引用: `runtime-flags.ts` — `Service extends ConfigService.Service<Service>()` 模式
- 常见陷阱: 忘记 `Layer.provide` 导致 MissingService；Layer 顺序错误

- [ ] **Step 7: 验证所有示例可运行**

```bash
cd docs/Effect-ts/demos/ch04-context-layer && bun install
bun run src/01-context-tag.ts
bun run src/02-layer-basics.ts
bun run src/03-provide-patterns.ts
bun run src/04-layer-composition.ts
```

- [ ] **Step 8: 提交**

```bash
git add docs/Effect-ts/chapter-04-context-layer.md docs/Effect-ts/demos/ch04-context-layer/
git commit -m "docs: Effect-TS book chapter 4 - Context & Layer"
```

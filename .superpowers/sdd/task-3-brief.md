### Task 3: 第 3 章 — Schema 运行时类型安全

**Files:**
- Create: `docs/Effect-ts/chapter-03-schema.md`
- Create: `docs/Effect-ts/demos/ch03-schema/package.json`
- Create: `docs/Effect-ts/demos/ch03-schema/README.md`
- Create: `docs/Effect-ts/demos/ch03-schema/src/01-basic-struct.ts`
- Create: `docs/Effect-ts/demos/ch03-schema/src/02-class-and-tag.ts`
- Create: `docs/Effect-ts/demos/ch03-schema/src/03-encode-decode.ts`
- Create: `docs/Effect-ts/demos/ch03-schema/src/04-type-inference.ts`

**Interfaces:**
- Consumes: 第 2 章 Effect 基础
- Produces: Schema 完整入门 + 4 个可运行示例
- OpenCode 参考: `packages/llm/src/schema/events.ts` — `Usage` Schema.Class 模式

- [ ] **Step 1: 创建 demo 目录和 package.json**

```json
{
  "name": "ch03-schema",
  "private": true,
  "type": "module",
  "scripts": {
    "demo:struct": "bun run src/01-basic-struct.ts",
    "demo:class": "bun run src/02-class-and-tag.ts",
    "demo:encode": "bun run src/03-encode-decode.ts",
    "demo:types": "bun run src/04-type-inference.ts"
  },
  "dependencies": {
    "effect": "4.0.0-beta.65"
  }
}
```

- [ ] **Step 2: 编写 01-basic-struct.ts — Schema.Struct 基础**

演示:
- `Schema.Struct({ field: Schema.String })` 基础结构
- `Schema.Number`, `Schema.Boolean`, `Schema.Literal`
- `Schema.optional`, `Schema.Array`, `Schema.Record`
- 数值约束（如 `Schema.GreaterThan(0)` 或 `Schema.check`）
- `Schema.decodeSync` / `Schema.decodeUnknownSync` 校验
- 校验失败时的错误信息

- [ ] **Step 3: 编写 02-class-and-tag.ts — Schema.Class 与 Schema.Tag**

演示:
- `Schema.Class<ClassName>()("ClassName")({ ... })` 类风格定义
- `Schema.TaggedErrorClass` — 带 tag 的错误类（参考 OpenCode Usage 模式）
- `Schema.TaggedStruct` — 带 tag 的结构体
- 类的实例化与方法定义
- 与普通 class + decorator 的对比

- [ ] **Step 4: 编写 03-encode-decode.ts — 序列化与反序列化**

演示:
- `Schema.encode` / `Schema.decode` — Effect 版本的编解码
- `Schema.encodeSync` / `Schema.decodeSync` — 同步版本
- `Schema.decodeUnknown` — 从 unknown 类型解码
- JSON 序列化往返（JSON → decode → 类型安全对象 → encode → JSON）
- 自定义 transform 进行数据清洗

- [ ] **Step 5: 编写 04-type-inference.ts — Schema 与 TS 类型双向推导**

演示:
- `typeof schema.Type` — Schema → TypeScript 类型
- `typeof schema.Encoded` — Schema → 编码类型
- `Schema.standardSchemaV1` — 与 Standard Schema 规范兼容
- Schema 作为"单一真相源"：类型定义 + 校验规则一处维护

- [ ] **Step 6: 编写 chapter-03-schema.md**

按七段式结构，重点:
- 概念讲解: TypeScript 类型在编译后消失 → Schema 提供运行时保障
- OpenCode 实战引用: `llm/src/schema/events.ts` 的 `Usage` 类 — `Schema.Class` + `get visibleOutputTokens()`
- 常见陷阱: 混淆 `.Type` 和 `.Encoded`；忘记 Schema 校验是运行时操作

- [ ] **Step 7: 验证所有示例可运行**

```bash
cd docs/Effect-ts/demos/ch03-schema && bun install
bun run src/01-basic-struct.ts
bun run src/02-class-and-tag.ts
bun run src/03-encode-decode.ts
bun run src/04-type-inference.ts
```

- [ ] **Step 8: 提交**

```bash
git add docs/Effect-ts/chapter-03-schema.md docs/Effect-ts/demos/ch03-schema/
git commit -m "docs: Effect-TS book chapter 3 - Schema"
```

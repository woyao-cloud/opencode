# 第 8 章 — Layer 进阶：复杂依赖图

本目录包含第 8 章的示例代码，演示 Layer 的高级用法。

## 运行方式

```bash
cd docs/Effect-ts/demos/ch08-layer-advanced
bun install
bun run demo:dynamic     # 01 — 动态 Layer 选择
bun run demo:conditional # 02 — 条件注入与错误处理
bun run demo:multi       # 03 — 多层架构
bun run demo:test        # 04 — 测试替换
```

## 示例列表

| 文件 | 主题 | 关键 API |
|------|------|----------|
| `01-dynamic-layer.ts` | 动态 Layer 选择 | `Layer.unwrap`, `Layer.effect`, `Layer.fresh` |
| `02-conditional.ts` | 条件注入与错误处理 | `Layer.orDie`, `Layer.catchTag`, `Layer.provideMerge` |
| `03-multi-layer-arch.ts` | 多层架构 | `Layer.mergeAll`, `Layer.provide`, 三层依赖 |
| `04-test-replacement.ts` | 测试替换 | `Layer.succeed`, `Effect.provideServiceEffect` |

# 第 4 章示例: Context 与 Layer — 依赖注入

本目录包含第 4 章的所有可运行示例代码。

## 运行环境

- **运行时**: Bun (必须)
- **Effect 版本**: 4.0.0-beta.65

## 快速开始

```bash
bun install
```

## 示例列表

| 文件 | 说明 | 运行命令 |
|------|------|----------|
| `src/01-context-tag.ts` | Context.GenericTag 声明服务、yield* 获取依赖、MissingService 错误 | `bun run demo:tag` |
| `src/02-layer-basics.ts` | Layer.succeed/sync/effect/scoped 四种构建方式、Layer.provide 依赖链 | `bun run demo:layer` |
| `src/03-provide-patterns.ts` | Effect.provide/provideService/provideServiceEffect、Layer.provideMerge、注入范围 | `bun run demo:provide` |
| `src/04-layer-composition.ts` | Layer.merge/flatMap、三层依赖体系 Config→Database→UserService | `bun run demo:compose` |

## 学习路径

1. 从 `01-context-tag.ts` 开始，理解 Context.GenericTag 如何声明服务接口
2. 然后看 `02-layer-basics.ts`，掌握 Layer 的四种构建方式
3. 接着看 `03-provide-patterns.ts`，了解 Effect.provide 的各种注入模式
4. 最后看 `04-layer-composition.ts`，学习如何构建完整的三层依赖体系

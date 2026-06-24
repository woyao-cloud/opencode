# 第 7 章示例: Config 配置管理

本目录包含第 7 章的所有可运行示例代码。

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
| `src/01-basic-config.ts` | Config.string/number/boolean/int/port、withDefault/option/nested/map、yield* 配置 | `bun run demo:basic` |
| `src/02-provider.ts` | ConfigProvider.fromUnknown/fromEnv/fromDotEnvContents、constantCase/orElse/nested/layer/layerAdd | `bun run demo:provider` |
| `src/03-composition.ts` | Config.all/schema、Schema.Struct、orElse、redacted、多层嵌套、验证失败 | `bun run demo:compose` |
| `src/04-runtime-flags-pattern.ts` | Context.Service 类 + Config + Layer 组合、多环境切换、多服务组合 | `bun run demo:flags` |

## 学习路径

1. 从 `01-basic-config.ts` 开始，理解 Config 的基本构造函数和常用算子
2. 然后看 `02-provider.ts`，掌握 ConfigProvider 的各种数据源
3. 接着看 `03-composition.ts`，学习 Schema 结构化配置和组合验证
4. 最后看 `04-runtime-flags-pattern.ts`，理解生产级的 RuntimeFlags 模式

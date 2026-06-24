# 第 9 章 — Schema 进阶：复杂数据建模

本章演示 Effect-TS Schema 的进阶用法，包括联合类型、变换、递归 Schema 和 API 类型系统。

## 环境准备

```bash
cd docs/Effect-ts/demos/ch09-schema-advanced
bun install
```

## 示例文件

| 文件 | 主题 | 运行命令 |
|------|------|----------|
| `src/01-union-literal.ts` | Union / Literal / TemplateLiteral | `bun run src/01-union-literal.ts` |
| `src/02-transform.ts` | Schema 变换 (Transform) | `bun run src/02-transform.ts` |
| `src/03-extend-omit.ts` | Schema 扩展与裁剪 | `bun run src/03-extend-omit.ts` |
| `src/04-recursive.ts` | 递归 Schema | `bun run src/04-recursive.ts` |
| `src/05-api-types.ts` | API 类型系统 | `bun run src/05-api-types.ts` |

## 运行所有示例

```bash
bun run src/01-union-literal.ts
bun run src/02-transform.ts
bun run src/03-extend-omit.ts
bun run src/04-recursive.ts
bun run src/05-api-types.ts
```

## 内容概要

- **01-union-literal.ts**: `Schema.Union`、`Schema.Literal`、`Schema.TemplateLiteral`、可区分联合
- **02-transform.ts**: `SchemaTransformation.transform`、`transformOrFail`、`decodeTo`、snake_case ↔ camelCase
- **03-extend-omit.ts**: 通过 Struct 组合实现 extend/omit/pick/partial
- **04-recursive.ts**: `S.suspend` 实现递归树形结构
- **05-api-types.ts**: 请求/响应/事件/错误 Schema，参考 OpenCode LLM 事件系统

## API 说明

本章使用 Effect 4.0.0-beta.65。部分 API 与最新版 Effect 有所不同：

- 使用 `SchemaTransformation.transform` 而非 `Schema.transform` 创建变换
- 使用 `S.suspend` 而非 `Schema.Lazy` 实现递归 Schema
- 使用 `Schema.TemplateLiteral([...])` 数组形式
- extend/omit/pick/partial 通过手动 Struct 组合实现

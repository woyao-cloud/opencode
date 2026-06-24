# ch20-migration-guide — 迁移指南与生态展望

本章是 Effect-TS 全书的最后一章，提供从传统 TypeScript 迁移到 Effect-TS 的完整策略，以及 Effect 生态系统的概览。

## 安装

```bash
cd docs/Effect-ts/demos/ch20-migration-guide
bun install
```

## 运行

```bash
# 场景 1: 四阶段迁移策略 — Schema 先行 → Effect 包装 → Layer DI → 全 Effect 架构
bun run demo:migration

# 场景 2: React 集成 — runPromise / Scope 生命周期 / runFork 事件处理
bun run demo:react

# 场景 3: 生态概览 — @effect/platform / @effect/cli / @effect/rpc / @effect/sql
bun run demo:ecosystem
```

## 文件说明

| 文件 | 说明 |
|------|------|
| `src/01-migration-strategy.ts` | 四阶段迁移策略，每个阶段展示 before→after 对比 |
| `src/02-react-integration.ts` | React 集成三种模式：runPromise、Scope 生命周期、runFork |
| `src/03-ecosystem.ts` | Effect 生态四大库：platform、cli、rpc、sql |

## 前置知识

- 第 1-19 章全部内容
- 对 React 的基本了解（第 2 个 demo）
- 对 HTTP、CLI、RPC、SQL 的基本了解（第 3 个 demo）

## 技术说明

- Effect 版本: `4.0.0-beta.65`
- 运行环境: Bun
- 每个 `.ts` 文件可独立运行，无相互依赖

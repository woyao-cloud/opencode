# SolidJS 深入浅出 — 面向 React 开发者的完全指南

> 以 OpenCode 项目为实战案例，从 React 开发者的视角深入理解 SolidJS

## 关于本书

本书面向有 React 经验的开发者，系统性地介绍 SolidJS —— 一个无虚拟 DOM、细粒度响应式的 UI 库。通过 OpenCode 项目的真实代码，帮助你理解 SolidJS 的设计哲学、实现原理和最佳实践。

## 目录

### 基础篇

1. [为什么选择 SolidJS？](01-introduction.md) — 解决的问题、核心优势、适用场景
2. [SolidJS 如何工作](02-how-solid-works.md) — 编译原理、响应式系统、信号图
3. [信号与计算](03-signals-and-memos.md) — `createSignal`、`createMemo`、依赖追踪
4. [副作用与生命周期](04-effects-and-lifecycle.md) — `createEffect`、`onCleanup`、`onMount`
5. [控制流组件](05-control-flow.md) — `Show`、`For`、`Index`、`Switch`、`Suspense`、`ErrorBoundary`、`Dynamic`
6. [Store 与状态管理](06-stores-and-state-management.md) — `createStore`、`produce`、`reconcile`、`batch`、Context
7. [组件与 Props](07-components-and-props.md) — `splitProps`、`Dynamic`、`lazy`、`ParentProps`

### 进阶篇

8. [路由与导航](08-routing-and-navigation.md) — `@solidjs/router` 路由方案
9. [异步与服务器状态](09-async-and-server-state.md) — `createResource`、`@tanstack/solid-query`
10. [生态与工具链](10-ecosystem-and-tooling.md) — Kobalte、solid-primitives、Vite、Tailwind
11. [SSR 与 SSG](11-ssr-and-ssg.md) — Astro + SolidJS islands

### 实践篇

12. [性能优化指南](12-optimization-guide.md) — Memo 缓存、batch 合并、reconcile 对比、equals 控制
13. [常见模式与解决方案](13-common-patterns.md) — 表单、动画、refs、拖拽、国际化
14. [React 迁移指南](14-migration-guide.md) — 思维模型转换、逐步迁移策略
15. [风险与陷阱](15-risks-and-pitfalls.md) — 内存泄漏、过度响应、生态成熟度

### 附录

- [React → SolidJS 速查表](appendix-cheatsheet.md)

## 开发环境

```bash
# 使用 Docker Compose 启动开发环境
docker compose -f docs/solidjs/docker-compose.yml up

# 或直接使用 Bun
bun install
bun run dev
```

## 关于 OpenCode 项目

OpenCode 是一个 AI 编程助手框架，使用 TypeScript + Bun + Effect-TS + SolidJS 构建。其桌面应用 (`packages/app`) 和 UI 组件库 (`packages/ui`) 大量使用 SolidJS，是学习 SolidJS 实战的绝佳案例。

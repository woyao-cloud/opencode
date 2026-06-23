# 第 1 章示例：为什么需要 Effect-TS？

本章通过三个可独立运行的 TypeScript 文件，从"痛点"到"初体验"再到"方案对比"，逐步建立对 Effect-TS 的初步认知。

## 学习路径

按以下顺序阅读和运行示例：

### 1. `01-pain-points.ts` — TypeScript 异步编程的三大痛点

**运行:** `bun run src/01-pain-points.ts`

展示纯 TypeScript 开发中三个常见问题：
- **痛点 1:** Promise 错误类型丢失 — `catch` 块中 `err` 是 `unknown`，无法区分网络错误 vs 业务错误
- **痛点 2:** 依赖注入靠手工 — 全局单例模式导致测试困难、耦合严重
- **痛点 3:** 副作用不可控 — 日志、时间等副作用与业务逻辑混在一起

**学习要点:** 先理解"问题是什么"，再学习"如何解决"。运行后观察输出，思考每个痛点在你自己的项目中是否也存在。

### 2. `02-first-effect.ts` — 第一个 Effect 程序

**运行:** `bun run src/02-first-effect.ts`

用 Effect-TS 重写痛点 1 的场景：
- 使用 `Schema.TaggedErrorClass` 定义类型化的错误（`NetworkError`、`NotFoundError`）
- 函数签名 `Effect<never, NetworkError | NotFoundError, { name, email }>` 明确声明了可能发生的错误类型
- `Effect.gen` + `yield*` 提供类似 `async/await` 的编程体验
- `Effect.runSync` 执行 Effect 程序

**学习要点:** 对比 `01-pain-points.ts` 中 `fetchUserData` 的签名差异 — Effect 版本将错误类型从"隐式"变为"显式"。

### 3. `03-comparison.ts` — 方案对比

**运行:** `bun run src/03-comparison.ts`

在同一场景下对比三种方案：
- **方案 A (纯 TS):** 错误类型丢失、依赖手工管理、校验与类型分离
- **方案 B (zod + 手工 DI):** 校验和类型需维护两份、DI 无标准方案
- **方案 C (Effect-TS):** Schema 同时提供类型和校验、Context + Layer 标准化 DI、错误类型化

**学习要点:** 理解 Effect-TS 的"一体化"优势 — 不是多个库的拼凑，而是一个统一框架。

## 前置知识

- TypeScript 基础语法
- Promise、async/await、try/catch
- 基本的 Node.js/Bun 运行环境

## 技术说明

- Effect 版本: `4.0.0-beta.65`
- 运行环境: Bun
- 每个 `.ts` 文件可独立运行，无相互依赖

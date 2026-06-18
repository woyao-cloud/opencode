# 《opencode Effect-TS 触发全景》— 全书大纲

## 写作目标

面向已了解 opencode 基本架构的开发者，用自然语言 + 时序图 + 代码解释的方式，完整展示 opencode 中所有 Effect-TS 代码的触发场景。每章聚焦一个场景类别，解释"Effect 代码在哪里被触发、为什么这样设计、用到了哪些 Effect 方法"。

## 全书结构

8 章 + 附录，每章统一结构：

```
N.1 场景概述          — 自然语言描述
N.2 触发流程（时序图）  — ASCII 时序图
N.3 关键触发点详解     — 文件+行号 + 代码 + 解释
N.4 涉及的 Effect 方法  — 本章用到的 Effect API 逐一解释
N.5 本章小结
```

## 章节总览

| 章 | 场景 | 触发点 | 核心 Effect 方法 |
|----|------|--------|-----------------|
| 1 | CLI 命令入口 | ~15 | `Effect.gen`, `Effect.runPromise`, `ManagedRuntime.make`, `Layer.provide` |
| 2 | HTTP 服务端 | ~5 | `Effect.runPromise`, `Layer.effect`, `Effect.provideService` |
| 3 | Agent 运行循环 | ~10 | `Effect.gen`, `Stream.runForEach`, `Effect.forEach`, `Effect.all`, `Latch` |
| 4 | 工具执行 | ~20 | `EffectBridge`, `bridge.promise`, `Effect.promise`, `Effect.withSpan` |
| 5 | 事件总线 | ~5 | `makeRuntime`, `Stream.runForEach`, `EffectBridge` |
| 6 | 会话管理 | ~15 | `Effect.forEach`(concurrency), `Effect.timeout`, `Layer.suspend`, `serviceUse` |
| 7 | 基础设施 | ~10 | `Effect.runSync`, `Effect.promise`, `makeRuntime` |
| 8 | 桥接层 | ~8 | `EffectBridge` 四种模式, `Effect.runFork`, `Effect.runPromiseExit` |

## 附录

- **Effect-TS 方法速查表**：全书涉及的所有 Effect 方法按字母排序
- **运行时体系图**：AppRuntime → BootstrapRuntime → makeRuntime 层次关系

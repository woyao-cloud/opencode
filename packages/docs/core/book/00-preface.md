# 前言

## 这本书为谁而写

如果你是一名 Java 开发者，日常工作中有使用 Spring Boot、Maven/Gradle、JPA/Hibernate 的经验，但正在或即将接触 TypeScript 与 Effect-ts 生态，这本书就是为你准备的。

OpenCode 是一个用 TypeScript 构建的 AI 辅助编码工具，它的核心包 `@opencode-ai/core` 大量使用了 [Effect-ts](https://effect.website/)——一个将函数式编程带入 TypeScript 主流的框架。Effect 在 TypeScript 世界中的地位，类似于 Spring Framework 在 Java 世界中的地位：它定义了"代码怎么写"的范式。

## 为什么用对比的方式讲解

我们在编写这本书时有一个基本假设：**你不是不懂编程，只是不懂 TypeScript/Effect 的语法和生态**。

这意味着：
- 你理解"依赖注入"的概念，只是需要知道 Effect 的 `Layer` 对应 Spring 的 `@Configuration`
- 你理解"异步编程"，只是需要知道 Effect 的 `Effect.gen` 对应 Java 的 `CompletableFuture`
- 你理解"类型安全"，只是需要知道 Effect Schema 对应 Jackson + Bean Validation

因此，这本书的每一章都会从一个 Java 开发者熟悉的场景切入，然后展示 TypeScript/Effect 如何解决同样的问题。

## 如何使用这本书

1. **顺序阅读**：前两章（TypeScript 基础和 Effect 基础）是所有后续章节的预备知识，建议按顺序阅读
2. **按需查阅**：第 3-10 章是按模块组织的，你可以直接跳到感兴趣的章节
3. **动手实践**：每章末尾有完整的代码示例，建议跟着敲一遍

## 配套代码

所有示例代码都可以在 `packages/core/src/` 中找到原始文件。书中会标注具体的行号范围，方便对照阅读。

## 关于 Effect v4

本书基于 Effect v4（`effect@4.0.0-beta.65`）。Effect 目前仍在快速演进中，但核心概念（Effect、Layer、Schema、Stream）已经稳定。本书关注的是这些核心概念，而非某个具体版本的 API 细节。

## 本书使用的约定

```
// TypeScript 代码示例
// 行内的注释用 //
```

```
// Java 对比代码（用于展示"Java 中怎么做"）
// 带有 "// Java" 标记
```

**粗体** 表示关键术语，可以在书末的术语表中查找。

`等宽字体` 表示代码、文件名或命令。

---

准备好了吗？让我们从 TypeScript 的类型系统开始，看看它和 Java 有什么不同，又有什么相似之处。
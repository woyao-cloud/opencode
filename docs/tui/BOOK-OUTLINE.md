# 《opencode TUI 架构：事件驱动的终端界面》— 全书大纲

## 写作目标

面向 opencode 开发者，用自然语言 + 时序图 + 代码解释的方式，完整展示 TUI 终端界面的 8 个子目录如何协同工作。核心叙事线：**Worker 线程发布事件 → RPC 推送到主线程 → context 层消费事件更新 Store → routes/component 层响应式重渲染 → ui/plugin/feature-plugins 提供组件支撑和扩展**。

## 全书结构

9 章 + 附录，每章统一结构：

```
N.1 目录概览          — 该目录下有哪些文件，各自做什么
N.2 事件流转（时序图）  — Worker 事件如何到达该层，如何触发重渲染
N.3 关键文件详解       — 逐个文件：代码作用 + 自然语言解释
N.4 涉及的 SolidJS 模式 — 该层用到的响应式模式
N.5 本章小结
```

## 章节总览

| 章 | 目录 | 文件数 | 核心内容 |
|----|------|--------|---------|
| 1 | 总览 | 入口 | 双线程架构全景、app.tsx 组件树、thread.ts 启动流程 |
| 2 | context/ | 19 | 事件消费核心：sync.tsx → Store 更新 → 响应式传播 |
| 3 | routes/ | 11 | 页面级组件：Home、Session（Prompt+Timeline+Footer+Sidebar） |
| 4 | component/ | 23 | 可复用组件：Prompt 输入框（~1500行核心）、各种 Dialog |
| 5 | ui/ | 10 | 基础 UI：Dialog 容器、Alert、Confirm、Prompt、Select、Toast |
| 6 | plugin/ | 5 | 插件 API：TuiPluginApi 实现、插槽系统、运行时 |
| 7 | feature-plugins/ | 13 | 功能插件：侧边栏、首页提示、系统通知 |
| 8 | config/ | 5 | TUI 配置：Schema、加载、快捷键、主题迁移 |
| 9 | util/ | 10 | 工具函数：剪贴板、编辑器、音频、滚动、选择 |
| 附录 | — | — | 组件树全景图 + 事件类型速查 + 文件索引 |

## 附录

- **组件树全景图**：从 `<App>` 到每个叶子组件的完整嵌套关系
- **事件类型速查**：TUI 消费的所有事件类型及其处理逻辑
- **文件索引**：所有 TUI 源文件的路径与功能说明

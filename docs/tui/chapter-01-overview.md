# 第 1 章 · 总览：双线程事件驱动架构

## 1.1 TUI 的定位

opencode 的 TUI（Terminal User Interface）是一个基于 React/Ink 的全屏终端界面。它运行在**主线程**，通过 RPC 与 **Worker 线程**（运行 HTTP 服务端 + Agent 引擎）通信。用户看到的所有界面——输入框、消息流、侧边栏、对话框——都是主线程中的 React/Ink 组件。

TUI 的核心设计理念是**事件驱动渲染**：Worker 线程产生事件（消息更新、工具执行、状态变化），通过 RPC 推送到主线程，主线程的 context 层消费事件并更新 SolidJS Store，组件树通过响应式订阅自动重渲染。

## 1.2 双线程架构全景

```text
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│         主线程 (TUI)             │      │        Worker 线程               │
│                                 │      │                                 │
│  app.tsx::tui()                 │      │  worker.ts                      │
│    │                             │      │    │                             │
│    ▼                             │      │    ▼                             │
│  React/Ink 渲染                  │      │  HTTP Server (端口 4096)         │
│                                 │      │    │                             │
│  ┌─────────────────────────┐    │      │    ▼                             │
│  │ context/sync.tsx        │    │      │  Agent 引擎                      │
│  │  · 订阅 Worker 事件      │◄───┼─RPC──│  · session/prompt.ts            │
│  │  · 更新 SolidJS Store   │    │      │  · tool/*.ts                    │
│  │  · 触发组件重渲染        │    │      │  · provider/*.ts                │
│  └─────────────────────────┘    │      │                                 │
│              │                   │      │  ┌─────────────────────────┐    │
│              ▼                   │      │  │ bus/index.ts            │    │
│  ┌─────────────────────────┐    │      │  │  · 发布事件              │    │
│  │ routes/ + component/    │    │      │  │  · GlobalBus → RPC Push  │    │
│  │  · Session 页面          │    │      │  └───────────┬─────────────┘    │
│  │  · Prompt 输入框         │    │      │              │                   │
│  │  · 消息时间线            │    │      │              │                   │
│  │  · 侧边栏/Footer        │    │      │              │                   │
│  └─────────────────────────┘    │      │              │                   │
│              │                   │      │              │                   │
│              ▼                   │      │              ▼                   │
│  ┌─────────────────────────┐    │      │  ┌─────────────────────────┐    │
│  │ ui/ + plugin/           │    │      │  │ GlobalBus               │    │
│  │  · Dialog 体系           │    │      │  │  · 序列化事件            │    │
│  │  · Toast 通知            │    │      │  │  · RPC 推送到主线程      │──┼──→
│  │  · 插件插槽              │    │      │  └─────────────────────────┘    │
│  └─────────────────────────┘    │      │                                 │
└─────────────────────────────────┘      └─────────────────────────────────┘
```

## 1.3 启动流程

**文件**：`thread.ts:231` → `app.tsx::tui()`

```text
bun run dev
  → src/index.ts (yargs)
    → TuiThreadCommand (thread.ts)
      → 创建 Worker 线程 (worker.ts)
      → 创建 RPC 客户端
      → createWorkerFetch (fetch 代理)
      → createEventSource (事件订阅)
      → import("./app") → tui({ url, fetch, events, config, ... })
        → render(<App ... />)  ← React/Ink 渲染入口
```

## 1.4 组件树全景

```text
<App>                                    ← app.tsx
  <ThemeProvider>                        ← context/theme.tsx
    <SDKProvider>                        ← context/sdk.tsx
      <SyncProvider>                     ← context/sync.tsx (事件消费核心)
        <LocalProvider>                  ← context/local.tsx
          <ProjectProvider>              ← context/project.tsx
            <RouteProvider>              ← context/route.tsx
              <Switch>
                <Home/>                  ← routes/home.tsx
                <Session/>              ← routes/session/index.tsx
                  ├─ <Prompt/>          ← component/prompt/index.tsx
                  ├─ <MessageTimeline/> ← session 内部组件
                  ├─ <Footer/>          ← routes/session/footer.tsx
                  └─ <Sidebar/>         ← routes/session/sidebar.tsx
              </Switch>
            </RouteProvider>
          </ProjectProvider>
        </LocalProvider>
      </SyncProvider>
    </SDKProvider>
  </ThemeProvider>
  <DialogProvider>                       ← ui/dialog.tsx
  <ToastProvider>                        ← ui/toast.tsx
  <PluginSlots/>                         ← plugin/slots.tsx
</App>
```

## 1.5 事件流转主线

```text
Worker 线程:
  Agent 引擎产生事件 (message.part.updated, session.status, ...)
    → bus/index.ts::publish()
    → GlobalBus
    → RPC 推送

主线程:
  RPC 接收
    → context/event.ts::EventSource
    → context/sync.tsx::event.subscribe()
      → 更新 SolidJS Store (sync.data.message, sync.data.part, ...)
        → createMemo / createEffect 自动触发
          → routes/ 和 component/ 组件重渲染
```

## 1.6 涉及的 SolidJS 核心模式

| 模式 | 作用 | 使用位置 |
|------|------|---------|
| `createStore` + `setStore` | 创建响应式数据 Store，局部更新触发重渲染 | `context/sync.tsx`、`component/prompt/index.tsx` |
| `createMemo` | 派生计算值，依赖变化时自动重新计算 | 各处 `useSync()`、`useLocal()` |
| `createEffect` | 副作用，依赖变化时自动执行 | `context/theme.tsx`、`context/event.ts` |
| `createSignal` | 创建单个响应式值 | `component/prompt/index.tsx` (input 状态) |
| `createSimpleContext` | 创建 Provider + useContext 模式 | `context/helper.tsx`，被所有 context 使用 |
| `onMount` / `onCleanup` | 组件生命周期 | 各处初始化/清理逻辑 |
| `Switch` / `Match` | 条件渲染 | `routes/` 路由切换 |
| `Show` / `For` | 条件/列表渲染 | 消息列表、文件列表等 |
| `batch` | 批量更新，合并多次 setStore 为一次重渲染 | `context/sync.tsx` |

## 1.7 本章小结

TUI 的架构核心是"事件驱动"——Worker 线程是事件生产者，主线程的 context 层是事件消费者和状态管理者，routes/component 层是状态消费者和 UI 渲染者。`createSimpleContext` 模式为每个功能域（sync、route、theme、local、sdk、project）创建独立的 Provider + Context，形成清晰的依赖边界。理解这个分层是理解后续各章的基础。

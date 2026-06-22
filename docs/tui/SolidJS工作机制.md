> Solid.js如何在cli上工作

Thought for 1m 3s, searched for 1 pattern, read 1 file

核心原理：opencode TUI 用的是 SolidJS（响应式引擎）+ @opentui（终端渲染器），不是浏览器 DOM。

SolidJS 如何在 CLI 上工作

关键：渲染目标不同

浏览器 React: Virtual DOM → ReactDOM → 浏览器 DOM 元素
浏览器 SolidJS: Signals → Solid DOM → 浏览器 DOM 元素

CLI opencode: SolidJS Signals → @opentui/solid → @opentui/core → 终端 ANSI 字符
↑
createCliRenderer()
操作 stdin/stdout

三步走

第一步：创建终端渲染器（app.tsx:185）

const renderer = await createCliRenderer({
targetFps: 60, // 终端刷新率
useMouse: true, // 支持鼠标点击
useKittyKeyboard: {}, // Kitty 终端协议（增强键盘输入）
exitOnCtrlC: false, // Ctrl+C 不退出，交给应用处理
})

createCliRenderer 来自 @opentui/core。它做的事情：

- 接管终端的 stdin（键盘输入）和 stdout（屏幕输出）
- 在 stdout 上绘制 ANSI 转义序列（颜色、光标移动、清屏）
- 监听 stdin 的按键事件，转换为组件可以处理的事件
- 维护一个"虚拟屏幕缓冲区"——每次渲染时计算差异，只重绘变化的部分

第二步：用 SolidJS 写组件，但用终端渲染器渲染（app.tsx:193）

await render(
() => (
<ErrorBoundary fallback={...}>
<ThemeProvider>
<SDKProvider>
<SyncProvider>
<RouteProvider>
<App />
</RouteProvider>
</SyncProvider>
</SDKProvider>
</ThemeProvider>
</ErrorBoundary>
),
renderer // ← 注意：第二个参数是终端渲染器，不是浏览器 DOM
)

render() 来自 @opentui/solid。它做的事情：

- 运行 SolidJS 的响应式系统（Signals、Stores、Memos、Effects）
- 当状态变化时，SolidJS 计算出哪些组件需要更新
- 但不是更新浏览器 DOM——而是调用 renderer 的终端绘制 API
- 组件返回的 TextareaRenderable、BoxRenderable 等被转换为终端字符

第三步：组件返回终端可渲染对象（Prompt 组件示例）

// 不是返回 <div> <input> <span>
// 而是返回终端原生元素：

<BoxRenderable> // → 终端上的一个矩形区域
<TextareaRenderable // → 终端上的文本输入区
value={store.prompt.input}
onChange={...}
/>
</BoxRenderable>

这些 \*Renderable 组件来自 @opentui/core，它们直接映射到终端操作：

- BoxRenderable → 用 ANSI 码画一个矩形框
- TextareaRenderable → 在终端中创建一个可编辑的文本区域
- TextRenderable → 在终端中渲染一段文字（带颜色/样式）

完整数据流

用户按键 (stdin)
│
▼
@opentui/core (renderer)
解析按键事件 → KeyEvent { name: "enter", ctrl: false, ... }
│
▼
@opentui/keymap
匹配快捷键 → "prompt.submit" 命令
│
▼
SolidJS 组件 (component/prompt/index.tsx)
submit() → submitInner()
│
├─ setStore("prompt", "input", "") ← SolidJS Store 更新
│
└─ sdk.client.session.prompt({...}) ← SDK 调用
→ RPC → Worker → Agent 引擎
│
│ Worker 推送事件
▼
context/sync.tsx
setStore("part", messageID, [...]) ← SolidJS Store 更新
│
▼
SolidJS 响应式系统
检测到 part[messageID] 变化
│
▼
createMemo / createEffect 自动触发
│
▼
@opentui/solid 协调器
计算需要更新的组件
│
▼
@opentui/core (renderer)
将变化转换为 ANSI 转义序列
写入 stdout
│
▼
终端屏幕更新 (用户看到新文字!)

与传统 Web 开发的对比

┌────────────┬──────────────────────────────┬───────────────────────────────────┐
│ │ 浏览器 SolidJS │ opencode TUI SolidJS │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 渲染目标 │ DOM (document.createElement) │ 终端 (createCliRenderer) │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 组件基类 │ <div>, <span>, <input> │ BoxRenderable, TextareaRenderable │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 样式系统 │ CSS │ ANSI 颜色码 (RGBA) + 终端属性 │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 事件系统 │ DOM Events (onClick) │ 终端 KeyEvent (onKeyDown) │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 布局引擎 │ CSS Flexbox/Grid │ 手动计算行列坐标 │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 输入 │ <input> / <textarea> │ 终端的 raw mode 字符流 │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 热更新 │ Vite HMR │ 无（需要重启进程） │
├────────────┼──────────────────────────────┼───────────────────────────────────┤
│ 响应式引擎 │ 同一个 SolidJS │ 同一个 SolidJS │
└────────────┴──────────────────────────────┴───────────────────────────────────┘

核心要点

SolidJS 本身不关心渲染目标——它只是一个响应式状态管理库。@opentui 做了两件事：

1. @opentui/solid：把 SolidJS 的组件树"协调"到终端渲染器（类似 ReactDOM 把 React 协调到
2. @opentui/core：提供终端原生元素（BoxRenderable、TextareaRenderable）和终端渲染引擎（ANSI 转义序列、键盘输入解析、鼠标支持）

所以 SolidJS 在 CLI 上工作的本质是：换了渲染目标，响应式引擎不变。createSignal、createStore、createMemo、createEffect 这些 API 在浏览器和终端中的行为完全一样，只是最终渲染到的"屏幕"不同。

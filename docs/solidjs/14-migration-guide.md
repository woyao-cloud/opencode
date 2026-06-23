# 第 14 章：React 迁移指南

## 14.1 思维模型转换

### 14.1.1 核心转变

从 React 迁移到 SolidJS 需要理解以下思维模型变化：

| React 思维 | SolidJS 思维 |
|-----------|-------------|
| "组件重渲染" | "信号更新" |
| "虚拟 DOM diff" | "细粒度 DOM 操作" |
| "不可变状态" | "响应式信号" |
| "依赖数组" | "自动追踪" |
| "每次渲染都是快照" | "始终读取最新值" |

### 14.1.2 组件只执行一次

这是最重要的概念转变：

```tsx
// React：每次状态变化都重新执行组件
function Counter() {
  const [count, setCount] = useState(0)
  // 每次 count 变化，整个函数重新执行
  const doubled = count * 2
  console.log("渲染")  // 每次更新都输出
  return <button onClick={() => setCount(c => c + 1)}>{doubled}</button>
}

// SolidJS：组件只执行一次
function Counter() {
  const [count, setCount] = createSignal(0)
  // 组件只执行一次，后续更新通过信号传播
  const doubled = createMemo(() => count() * 2)
  console.log("渲染")  // 只输出一次
  return <button onClick={() => setCount(c => c + 1)}>{doubled()}</button>
}
```

## 14.2 逐步迁移策略

### 14.2.1 方案 1：新项目直接使用 SolidJS

对于新项目，直接使用 SolidJS 是最简单的方案。使用 Vite 模板：

```bash
npm create vite@latest my-app -- --template solid-ts
```

### 14.2.2 方案 2：在现有项目中逐步引入

如果需要在现有 React 项目中引入 SolidJS，可以通过 Web Components 或 iframe 桥接：

```tsx
// React 项目中嵌入 SolidJS 组件
// 使用 Web Components 作为桥接层
class SolidJSBridge extends HTMLElement {
  connectedCallback() {
    const root = document.createElement("div")
    this.appendChild(root)
    render(() => <SolidComponent />, root)
  }
}
customElements.define("solid-bridge", SolidJSBridge)
```

### 14.2.3 方案 3：使用 Astro 混合

Astro 支持在同一页面中混合使用 React 和 SolidJS：

```astro
---
import ReactComponent from "../components/ReactComponent"
import SolidComponent from "../components/SolidComponent"
---

<ReactComponent client:load />
<SolidComponent client:load />
```

## 14.3 API 映射

### 14.3.1 状态管理

```tsx
// React → SolidJS
useState(0)                    → createSignal(0)
useState({ count: 0 })         → createStore({ count: 0 })
useReducer(reducer, init)      → createStore(init) + 自定义 reducer
useMemo(() => fn(dep), [dep])  → createMemo(() => fn(dep()))
useCallback(fn, [dep])         → 不需要（组件不重渲染）
useRef(initial)                → let ref: Type | undefined
```

### 14.3.2 副作用

```tsx
// React → SolidJS
useEffect(fn, [])              → onMount(fn)
useEffect(fn, [dep])           → createEffect(fn)（自动追踪）
useEffect(() => { return cleanup }, []) → onMount(() => { onCleanup(cleanup) })
useLayoutEffect(fn, [dep])     → createEffect(fn)（默认同步执行）
```

### 14.3.3 渲染

```tsx
// React → SolidJS
{condition && <C/>}            → <Show when={condition()}>
{condition ? <A/> : <B/>}      → <Show when={condition()} fallback={<B/>}>
{array.map(fn)}                → <For each={array()}>{fn}</For>
{array.map((v,i) => ...)}     → <Index each={array()}>{(v,i) => ...}</Index>
<Component is={...}>           → <Dynamic component={...}>
React.lazy(() => import())     → lazy(() => import())
```

### 14.3.4 事件

```tsx
// React → SolidJS
onClick={handleClick}          → onClick={handleClick}（相同）
onChange={handleChange}       → onInput={handleChange}（或 onChange）
onSubmit={handleSubmit}       → onSubmit={handleSubmit}（相同）
```

## 14.4 常见迁移陷阱

### 陷阱 1：解构 Props

```tsx
// React：安全
function Button({ variant, size, children }) { ... }

// SolidJS：丢失响应性
function Button({ variant, size, children }) { ... }  // ❌

// 正确做法
function Button(props) {
  return <button data-variant={props.variant}>{props.children}</button>
}
```

### 陷阱 2：使用 map 而不是 For

```tsx
// React：使用 map
{items.map(item => <Item key={item.id} data={item} />)}

// SolidJS：使用 For
<For each={items()}>{(item) => <Item data={item} />}</For>
```

### 陷阱 3：在 JSX 外读取信号

```tsx
// ❌ 错误
const value = count()  // 在组件作用域读取，不建立依赖
return <div>{value}</div>

// ✅ 正确
return <div>{count()}</div>  // 在 JSX 中读取，自动追踪
```

### 陷阱 4：忘记 onCleanup

```tsx
// React：通过 return 清理
useEffect(() => {
  const timer = setInterval(tick, 1000)
  return () => clearInterval(timer)
}, [])

// SolidJS：使用 onCleanup
onMount(() => {
  const timer = setInterval(tick, 1000)
  onCleanup(() => clearInterval(timer))
})
```

## 14.5 迁移检查清单

- [ ] 理解"组件只执行一次"的概念
- [ ] 将所有 `useState` 替换为 `createSignal` 或 `createStore`
- [ ] 将所有 `useEffect` 替换为 `createEffect` 或 `onMount`
- [ ] 将所有 `useMemo` 替换为 `createMemo`
- [ ] 将所有 `array.map()` 替换为 `<For>`
- [ ] 将所有条件渲染替换为 `<Show>`
- [ ] 添加 `onCleanup` 清理所有副作用
- [ ] 确保 props 没有被解构
- [ ] 确保所有信号在 JSX 中作为函数调用
- [ ] 添加 `Suspense` 包裹异步组件

---

**下一章：[风险与陷阱](15-risks-and-pitfalls.md)**

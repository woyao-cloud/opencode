# 附录：React → SolidJS 速查表

## 状态管理

| React | SolidJS |
|-------|---------|
| `useState(initial)` | `createSignal(initial)` |
| `const [state, setState] = useState(0)` | `const [state, setState] = createSignal(0)` |
| `setState(newVal)` | `setState(newVal)` |
| `setState(prev => prev + 1)` | `setState(prev => prev + 1)` |
| `useState({ count: 0 })` | `createStore({ count: 0 })` |
| `setState(prev => ({...prev, count: 1}))` | `setState("count", 1)` |
| `useReducer(reducer, init)` | `createStore(init)` + 自定义函数 |
| `useRef(initial)` | `let ref: Type \| undefined` |

## 计算属性

| React | SolidJS |
|-------|---------|
| `useMemo(() => fn(dep), [dep])` | `createMemo(() => fn(dep()))` |
| `useCallback(fn, [dep])` | 不需要（组件不重渲染） |

## 副作用

| React | SolidJS |
|-------|---------|
| `useEffect(fn, [])` | `onMount(fn)` |
| `useEffect(fn, [dep])` | `createEffect(fn)` |
| `useEffect(() => { return cleanup }, [])` | `onMount(() => { onCleanup(cleanup) })` |
| `useLayoutEffect(fn, [dep])` | `createEffect(fn)`（默认同步） |

## 条件渲染

| React | SolidJS |
|-------|---------|
| `{condition && <C/>}` | `<Show when={condition()}>` |
| `{condition ? <A/> : <B/>}` | `<Show when={condition()} fallback={<B/>}>` |
| `{switch(val) { case a: ... }}` | `<Switch><Match when={val() === a}>` |

## 列表渲染

| React | SolidJS |
|-------|---------|
| `{arr.map(fn)}` | `<For each={arr()}>{fn}</For>` |
| `{arr.map((v,i) => ...)}` | `<Index each={arr()}>{(v,i) => ...}</Index>` |
| `{arr.filter(fn).map(fn)}` | `<For each={arr().filter(fn)}>{fn}</For>` |

## 异步

| React | SolidJS |
|-------|---------|
| `useEffect(() => { fetch(url).then(setData) }, [url])` | `const [data] = createResource(url, fetch)` |
| `React.lazy(() => import("./C"))` | `lazy(() => import("./C"))` |
| `<Suspense fallback={<L/>}>` | `<Suspense fallback={<L/>}>` |
| `<ErrorBoundary fallback={<E/>}>` | `<ErrorBoundary fallback={<E/>}>` |

## 组件

| React | SolidJS |
|-------|---------|
| 函数组件 | 函数组件（只执行一次） |
| `props` 解构 | 不解构，通过 `props.x` 访问 |
| `...rest` | `splitProps(props, ["local"])` |
| `<Component is={...}>` | `<Dynamic component={...}>` |
| `children` | `props.children` / `ParentProps` |

## 路由

| React | SolidJS |
|-------|---------|
| `react-router-dom` | `@solidjs/router` |
| `<BrowserRouter>` | `<Router>` |
| `<Routes>` | `<Router>` |
| `<Route path="/" element={<C/>}>` | `<Route path="/" component={C}>` |
| `useParams()` | `useParams()` |
| `useNavigate()` | `useNavigate()` |
| `<Link to="/">` | `<Link href="/">` / `<A href="/">` |

## 数据获取

| React | SolidJS |
|-------|---------|
| `@tanstack/react-query` | `@tanstack/solid-query` |
| `useQuery(...)` | `useQuery(...)`（API 相同） |
| `useMutation(...)` | `useMutation(...)`（API 相同） |

## UI 组件

| React | SolidJS |
|-------|---------|
| `@radix-ui/react-dialog` | `@kobalte/core/dialog` |
| `@radix-ui/react-popover` | `@kobalte/core/popover` |
| `@radix-ui/react-select` | `@kobalte/core/select` |
| `@radix-ui/react-dropdown-menu` | `@kobalte/core/dropdown-menu` |
| `@radix-ui/react-accordion` | `@kobalte/core/accordion` |

## 工具库

| React | SolidJS |
|-------|---------|
| `react-use` / `ahooks` | `@solid-primitives/*` |
| `framer-motion` | `motion`（通用） |
| `dnd-kit` | `@thisbeyond/solid-dnd` |
| `react-helmet` | `@solidjs/meta` |
| `@sentry/react` | `@sentry/solid` |

## 构建工具

| React | SolidJS |
|-------|---------|
| `@vitejs/plugin-react` | `vite-plugin-solid` |
| `@astrojs/react` | `@astrojs/solid-js` |

## 常见模式速查

```tsx
// 1. 计数器
// React
const [count, setCount] = useState(0)
;<button onClick={() => setCount(c => c + 1)}>{count}</button>

// SolidJS
const [count, setCount] = createSignal(0)
;<button onClick={() => setCount(c => c + 1)}>{count()}</button>

// 2. 表单输入
// React
const [name, setName] = useState("")
;<input value={name} onChange={e => setName(e.target.value)} />

// SolidJS
const [name, setName] = createSignal("")
;<input value={name()} onInput={e => setName(e.target.value)} />

// 3. 列表
// React
{items.map(item => <div key={item.id}>{item.name}</div>)}

// SolidJS
<For each={items()}>{(item) => <div>{item.name}</div>}</For>

// 4. 条件
// React
{loading ? <Spinner /> : <Content />}

// SolidJS
<Show when={loading()} fallback={<Content />}><Spinner /></Show>

// 5. 异步数据
// React
const [data, setData] = useState(null)
useEffect(() => { fetch(url).then(setData) }, [url])

// SolidJS
const [data] = createResource(url, fetch)

// 6. 定时器
// React
useEffect(() => {
  const timer = setInterval(tick, 1000)
  return () => clearInterval(timer)
}, [])

// SolidJS
onMount(() => {
  const timer = setInterval(tick, 1000)
  onCleanup(() => clearInterval(timer))
})

// 7. 事件监听
// React
useEffect(() => {
  window.addEventListener("resize", handler)
  return () => window.removeEventListener("resize", handler)
}, [])

// SolidJS
onMount(() => {
  makeEventListener(window, "resize", handler)
  // 自动清理
})

// 8. 派生状态
// React
const doubled = useMemo(() => count * 2, [count])

// SolidJS
const doubled = createMemo(() => count() * 2)
```

## 关键概念速查

| 概念 | React | SolidJS |
|------|-------|---------|
| 组件执行次数 | 每次状态变化 | 只执行一次 |
| 更新粒度 | 组件级 | 表达式级 |
| 依赖管理 | 手动数组 | 自动追踪 |
| 虚拟 DOM | 是 | 否 |
| 运行时大小 | ~40KB | ~8KB |
| 渲染性能 | 依赖优化 | 默认高效 |
| 学习曲线 | 熟悉 | 对 React 开发者平缓 |

## 常见错误速查

```tsx
// ❌ 错误 → ✅ 正确

// 1. 解构 props
// ❌ function Bad({ name }) { return <div>{name}</div> }
// ✅ function Good(props) { return <div>{props.name}</div> }

// 2. 使用 map 而不是 For
// ❌ {items().map(item => <Item data={item} />)}
// ✅ <For each={items()}>{(item) => <Item data={item} />}</For>

// 3. 忘记 onCleanup
// ❌ createEffect(() => { setInterval(tick, 1000) })
// ✅ createEffect(() => { const t = setInterval(tick, 1000); onCleanup(() => clearInterval(t)) })

// 4. 在 JSX 外读取信号
// ❌ const v = count(); return <div>{v}</div>
// ✅ return <div>{count()}</div>

// 5. 在 createEffect 中更新信号导致循环
// ❌ createEffect(() => setCount(count() + 1))
// ✅ const doubled = createMemo(() => count() * 2)
```

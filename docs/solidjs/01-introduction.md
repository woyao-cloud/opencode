# 第 1 章：为什么选择 SolidJS？

## 1.1 SolidJS 解决了什么问题

作为 React 开发者，你可能已经习惯了以下"常态"：

- **不必要的重渲染** — 父组件更新导致整个子树重渲染，即使子组件的 props 没变
- **闭包陷阱（Stale Closure）** — `useEffect` 或事件处理中捕获了过时的状态值
- **依赖数组管理** — `useEffect`、`useMemo`、`useCallback` 的依赖数组需要手动维护，漏掉或多余都会导致 bug
- **Hook 规则限制** — 不能在条件或循环中使用 Hook，必须保证每次渲染调用顺序一致
- **虚拟 DOM 开销** — 每次更新都要构建新的虚拟 DOM 树并进行 diff 比较

SolidJS 通过**无虚拟 DOM + 细粒度响应式**的设计，从根本上解决了这些问题。

## 1.2 核心优势

### 1.2.1 真正的细粒度响应式

SolidJS 的响应式系统在**编译时**将 JSX 中的响应式表达式拆解为独立的更新单元。当状态变化时，只有依赖该状态的具体 DOM 节点会被更新，而不是整个组件。

```tsx
// React 版本：状态变化时整个组件重渲染
function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <h1>计数: {count}</h1>  {/* count 变化 → 整个 Counter 重渲染 */}
      <ExpensiveTree />        {/* 也被迫重渲染 */}
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  )
}

// SolidJS 版本：只有 count 文本节点被更新
function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <h1>计数: {count()}</h1>  {/* count 变化 → 仅更新这个文本节点 */}
      <ExpensiveTree />          {/* 完全不受影响 */}
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  )
}
```

### 1.2.2 无虚拟 DOM

SolidJS 不使用虚拟 DOM。它直接在编译时将 JSX 编译为真实的 DOM 操作。这意味着：

- **更少的内存分配** — 不需要创建和比较虚拟 DOM 树
- **更快的初始渲染** — 没有虚拟 DOM 构建阶段
- **更可预测的性能** — 更新范围精确到单个 DOM 节点

### 1.2.3 无闭包陷阱

在 SolidJS 中，你通过**函数调用**读取信号值，而不是通过闭包捕获：

```tsx
// React：闭包陷阱
function Timer() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => {
      setCount(count + 1)  // count 始终是 0！闭包捕获了初始值
    }, 1000)
    return () => clearInterval(timer)
  }, [])  // 依赖数组为空，count 永远不会更新
}

// SolidJS：无闭包陷阱
function Timer() {
  const [count, setCount] = createSignal(0)
  createEffect(() => {
    const timer = setInterval(() => {
      setCount(c => c + 1)  // 函数式更新，始终获取最新值
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })  // 无需依赖数组！
}
```

### 1.2.4 无依赖数组

SolidJS 的响应式系统在**运行时自动追踪依赖**。你不需要手动声明 `useEffect`、`useMemo` 或 `useCallback` 的依赖数组：

```tsx
// React：需要手动管理依赖数组
const doubled = useMemo(() => count * 2, [count])  // 漏掉 count → bug
useEffect(() => {
  document.title = `计数: ${count}`
}, [count])  // 漏掉 count → 不会更新

// SolidJS：自动追踪依赖
const doubled = createMemo(() => count() * 2)  // 自动追踪 count()
createEffect(() => {
  document.title = `计数: ${count()}`  // 自动追踪 count()
})
```

### 1.2.5 组件级控制流

SolidJS 使用**组件**（而非 JS 表达式）来控制渲染流程，这使得控制流本身也是响应式的：

```tsx
// React：使用 JS 表达式
return (
  <div>
    {items.map(item => <Item key={item.id} data={item} />)}
    {loading && <Spinner />}
    {error ? <Error msg={error} /> : null}
  </div>
)

// SolidJS：使用控制流组件
return (
  <div>
    <For each={items()}>{(item) => <Item data={item} />}</For>
    <Show when={loading()}><Spinner /></Show>
    <Show when={error()} fallback={null}>
      <Error msg={error()} />
    </Show>
  </div>
)
```

`For` 组件只会在 items 数组**变化的部分**执行更新，而不是重新创建整个列表。

## 1.3 OpenCode 中的实践

OpenCode 的桌面应用 (`packages/app`) 是 SolidJS 在大型项目中的成功实践。它包含：

- **50+ 组件** — 从按钮、对话框到复杂的消息时间线
- **20+ Context Provider** — 使用 SolidJS 的 Context + Store 模式管理全局状态
- **实时消息流** — AI 会话消息的增量渲染
- **复杂交互** — 拖拽排序、代码 diff 渲染、终端模拟

在后续章节中，我们将通过 OpenCode 的实际代码深入理解每个概念。

## 1.4 适用场景

### 非常适合
- **高性能交互应用** — 需要大量实时更新的 UI（如 AI 聊天、代码编辑器、仪表盘）
- **资源受限环境** — 内存和 CPU 有限的设备
- **大型应用** — 需要可预测的更新性能

### 需要评估
- **团队经验** — 团队需要从 React 思维转换
- **生态需求** — 某些 React 专属库没有 SolidJS 版本
- **SSR 需求** — 虽然支持 SSR，但生态不如 Next.js 成熟

## 1.5 与 React 的定位差异

| 维度 | React | SolidJS |
|------|-------|---------|
| 渲染机制 | 虚拟 DOM + Diff | 编译时 + 细粒度 DOM 操作 |
| 更新粒度 | 组件级 | 表达式/节点级 |
| 响应式 | 不可变状态 + 重渲染 | 信号 + 自动依赖追踪 |
| 控制流 | JS 表达式 | 控制流组件 |
| 学习曲线 | 熟悉 | 对 React 开发者较平缓 |

---

**下一章：[SolidJS 如何工作](02-how-solid-works.md)**

# 第 2 章：SolidJS 如何工作

## 2.1 整体架构

SolidJS 由两个核心部分组成：

1. **编译器（Compiler）** — 在构建时转换 JSX，将响应式表达式拆解为细粒度的 DOM 操作
2. **运行时（Runtime）** — 提供信号图（Signal Graph）引擎，管理依赖追踪和更新传播

```
源代码 → [SolidJS 编译器] → 优化后的 JS → [运行时信号图] → DOM 更新
```

## 2.2 编译时：JSX 转换

### 2.2.1 无虚拟 DOM 的 JSX

React 的 JSX 编译为 `React.createElement` 调用，生成虚拟 DOM 节点：

```tsx
// 源代码
<div className="container">
  <h1>{count}</h1>
</div>

// React 编译结果
React.createElement("div", { className: "container" },
  React.createElement("h1", null, count)  // 每次重渲染都重新创建
)
```

SolidJS 的 JSX 编译为直接的 DOM 操作：

```tsx
// 源代码
<div class="container">
  <h1>{count()}</h1>
</div>

// SolidJS 编译结果（简化）
const _el$ = _tmpl$()  // 克隆模板
_el$.className = "container"
createComponent("h1", {
  children: () => count()  // 响应式表达式被包装为函数
})
```

关键区别：
- **模板克隆** — 静态 HTML 结构被编译为模板字符串，通过 `cloneNode` 快速创建
- **表达式包装** — 每个 `{}` 中的响应式表达式被包装为函数，在运行时独立追踪
- **无中间表示** — 不创建虚拟 DOM，直接操作真实 DOM

### 2.2.2 细粒度更新

SolidJS 编译器将 JSX 中的每个动态表达式拆解为独立的更新单元：

```tsx
// 源代码
function Profile(props) {
  return <div>
    <p>姓名: {props.name}</p>
    <p>年龄: {props.age}</p>
  </div>
}

// 编译后（概念）
function Profile(props) {
  const _div = <div/>  // 静态模板
  const _p1 = _div.firstChild
  const _p2 = _div.lastChild

  createEffect(() => _p1.textContent = `姓名: ${props.name}`)  // 仅当 name 变化时更新
  createEffect(() => _p2.textContent = `年龄: ${props.age}`)   // 仅当 age 变化时更新

  return _div
}
```

当 `props.name` 变化时，只有第一行 `createEffect` 会重新执行，`_p2` 完全不受影响。

## 2.3 运行时：信号图（Signal Graph）

### 2.3.1 核心概念

SolidJS 的运行时基于**观察者模式**，核心数据结构是**信号图**：

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Signal A │────>│  Memo B  │────>│ Effect C │
│ (count)  │     │ (doubled)│     │ (DOM)    │
└──────────┘     └──────────┘     └──────────┘
      │
      └──────────>┌──────────┐
                  │ Effect D │
                  │ (console)│
                  └──────────┘
```

- **Signal（信号）** — 响应式系统的根节点，存储值并维护订阅者列表
- **Memo（计算）** — 派生信号，缓存计算结果，仅在依赖变化时重新计算
- **Effect（副作用）** — 观察者，当依赖变化时自动重新执行

### 2.3.2 依赖追踪机制

SolidJS 在运行时使用**全局栈**来追踪依赖关系：

```tsx
// 伪代码：依赖追踪原理
let currentObserver = null  // 全局当前观察者

function createSignal(initial) {
  const subscribers = new Set()
  let value = initial

  const read = () => {
    if (currentObserver) {
      subscribers.add(currentObserver)  // 注册依赖
      currentObserver.deps.add(subscribers)  // 双向绑定
    }
    return value
  }

  const write = (next) => {
    value = typeof next === "function" ? next(value) : next
    // 通知所有订阅者
    for (const sub of [...subscribers]) {
      sub.execute()
    }
  }

  return [read, write]
}

function createEffect(fn) {
  const effect = {
    deps: new Set(),
    execute: () => {
      // 清理旧依赖
      for (const dep of effect.deps) {
        dep.delete(effect)
      }
      effect.deps.clear()
      // 设置为当前观察者
      currentObserver = effect
      fn()  // 执行时自动重新注册依赖
      currentObserver = null
    }
  }
  effect.execute()  // 首次执行
}
```

**执行流程：**

1. `createEffect(fn)` 首次执行时，将自身设为 `currentObserver`
2. `fn` 中读取 `count()` → 触发 `read()` → `count` 的订阅者列表中加入该 effect
3. 当 `setCount(newVal)` 调用时 → 遍历所有订阅者 → 重新执行 effect
4. effect 重新执行前，先**清理所有旧依赖**，然后重新追踪

这就是为什么 SolidJS **不需要依赖数组** — 依赖关系在运行时自动建立和清理。

### 2.3.3 同步执行

与 React 的异步批处理不同，SolidJS 的更新是**同步**的：

```tsx
const [count, setCount] = createSignal(0)
createEffect(() => {
  console.log("count 变化:", count())
})

setCount(1)  // 立即输出: count 变化: 1
console.log("after set")  // 然后输出: after set
```

这意味着当你调用 `setCount` 后，所有相关的 DOM 更新和副作用已经同步执行完毕。没有微任务队列，没有异步调度。

### 2.3.4 批处理（batch）

虽然默认是同步的，但 SolidJS 提供了 `batch` 来合并多个更新：

```tsx
import { batch } from "solid-js"

const [x, setX] = createSignal(0)
const [y, setY] = createSignal(0)

createEffect(() => {
  console.log("x 或 y 变化:", x(), y())
})

// 无 batch：触发 2 次 effect
setX(1)  // 输出: x 或 y 变化: 1 0
setY(1)  // 输出: x 或 y 变化: 1 1

// 使用 batch：只触发 1 次 effect
batch(() => {
  setX(2)
  setY(2)
})  // 输出: x 或 y 变化: 2 2
```

## 2.4 OpenCode 中的实践

### 2.4.1 信号图在 Context 中的应用

OpenCode 的 `createSimpleContext` 工具封装了 SolidJS 的 Context + 信号模式：

```tsx
// packages/ui/src/context/helper.tsx
export function createSimpleContext<T, Props>(input: {
  name: string
  init: ((input: Props) => T) | (() => T)
  gate?: boolean
}) {
  const ctx = createContext<T>()
  return {
    provider: (props: ParentProps<Props>) => {
      const init = input.init(props)
      const gate = input.gate ?? true
      if (!gate) {
        return <ctx.Provider value={init}>{props.children}</ctx.Provider>
      }
      const isReady = createMemo(() => {
        const ready = init.ready
        return ready === undefined ||
          (typeof ready === "function" ? ready() : ready)
      })
      return (
        <Show when={isReady()}>
          <ctx.Provider value={init}>{props.children}</ctx.Provider>
        </Show>
      )
    },
    use() {
      const value = useContext(ctx)
      if (!value) throw new Error("必须在 Provider 内使用")
      return value
    },
  }
}
```

这个模式的关键在于：
- `init` 函数在 Provider 挂载时执行一次，创建所有信号和 store
- 返回的对象直接作为 Context 值，无需 `value` prop
- `gate` 选项通过 `createMemo` + `Show` 实现条件渲染，直到数据就绪

### 2.4.2 使用示例

```tsx
// packages/app/src/context/layout.tsx
export const { use: useLayout, provider: LayoutProvider } = createSimpleContext({
  name: "Layout",
  init: () => {
    const [sidebar, setSidebar] = createStore({ opened: false, width: 344 })
    const [terminal, setTerminal] = createStore({ height: 280, opened: false })

    const ready = true
    return { ready, sidebar, setSidebar, terminal, setTerminal }
  },
})
```

## 2.5 与 React 的关键区别

| 特性 | React | SolidJS |
|------|-------|---------|
| 渲染触发 | 状态变化 → 组件重渲染 | 信号变化 → 精确更新依赖节点 |
| 更新调度 | 异步批处理 | 同步执行（可手动 batch） |
| 依赖管理 | 手动依赖数组 | 运行时自动追踪 |
| 内存模型 | 每次渲染创建新 VNode | 信号图持久存在，按需更新 |
| 编译优化 | 可选的（React Forget） | 必需的（JSX 编译） |

---

**下一章：[信号与计算](03-signals-and-memos.md)**

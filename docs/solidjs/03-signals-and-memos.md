# 第 3 章：信号与计算

## 3.1 createSignal

### 3.1.1 基本用法

`createSignal` 是 SolidJS 最基础的响应式原语，返回一个**读取函数**和**写入函数**的元组：

```tsx
import { createSignal } from "solid-js"

const [count, setCount] = createSignal(0)

// 读取：必须作为函数调用
console.log(count())  // 0

// 写入：直接设置
setCount(5)
console.log(count())  // 5

// 写入：函数式更新
setCount(prev => prev + 1)
console.log(count())  // 6
```

### 3.1.2 与 React useState 的关键区别

```tsx
// React：解构后是值本身
const [count, setCount] = useState(0)
;<p>{count}</p>  // count 是值

// SolidJS：解构后是 getter 函数
const [count, setCount] = createSignal(0)
;<p>{count()}</p>  // count() 是函数调用
```

这个区别至关重要：
- **React** — 组件重渲染时，`count` 是当前渲染快照中的值
- **SolidJS** — `count()` 在每次调用时读取当前值，自动建立依赖追踪

### 3.1.3 信号选项

```tsx
// 自定义比较器（默认使用 ===）
const [count, setCount] = createSignal(0, {
  equals: (a, b) => Math.abs(a - b) < 0.01  // 浮点数容差比较
})

// 不相等时通知
const [name, setName] = createSignal("", {
  equals: false  // 每次 set 都通知订阅者，即使值相同
})
```

### 3.1.4 OpenCode 中的信号使用

OpenCode 中信号主要用于**局部组件状态**：

```tsx
// packages/app/src/pages/session/composer/session-composer-region.tsx
const [closing, setClosing] = createSignal(false)
const [dock, setDock] = createSignal<"todo" | "followup" | "permission" | "question" | "revert" | null>(null)

// 派生状态
const open = createMemo(() => store.ready && dock() && !closing())
```

## 3.2 createMemo

### 3.2.1 基本用法

`createMemo` 创建一个**缓存的计算值**，仅在依赖变化时重新计算：

```tsx
const [count, setCount] = createSignal(0)

// 自动追踪 count()
const doubled = createMemo(() => {
  console.log("重新计算 doubled")
  return count() * 2
})

console.log(doubled())  // 0（首次计算）
setCount(1)             // 输出: 重新计算 doubled
console.log(doubled())  // 2（缓存值，不重新计算）
```

### 3.2.2 与 React useMemo 的区别

```tsx
// React：需要手动声明依赖
const doubled = useMemo(() => count * 2, [count])

// SolidJS：自动追踪依赖
const doubled = createMemo(() => count() * 2)
```

更重要的是，SolidJS 的 `createMemo` 返回的是一个**信号**（getter 函数），而 React 的 `useMemo` 返回的是值：

```tsx
// React：返回普通值
const doubled = useMemo(() => count * 2, [count])
// 使用：{doubled}

// SolidJS：返回 getter 函数
const doubled = createMemo(() => count() * 2)
// 使用：{doubled()}
```

### 3.2.3 Memo 链

Memo 可以链式组合，形成高效的依赖图：

```tsx
const [items, setItems] = createSignal([1, 2, 3, 4, 5])

// 链式 memo
const active = createMemo(() => items().filter(item => item.active))
const total = createMemo(() => active().reduce((sum, item) => sum + item.price, 0))
const formatted = createMemo(() => `$${total().toFixed(2)}`)

// 当 items 变化时，只有受影响的 memo 会重新计算
// 如果 items 变化但 active 结果不变，total 和 formatted 不会重新计算
```

### 3.2.4 OpenCode 中的 Memo 链

OpenCode 的消息时间线组件展示了典型的 memo 链模式：

```tsx
// packages/app/src/pages/session/message-timeline.tsx
const sessionID = createMemo(() => params.id)
const sessionMessages = createMemo(() => {
  const id = sessionID()
  if (!id) return emptyMessages
  return sync.data.message[id] ?? emptyMessages
})
const pending = createMemo(() =>
  sessionMessages().findLast(
    (item) => item.role === "assistant" && typeof item.time.completed !== "number",
  ),
)
const rendered = createMemo(() => {
  const msgs = sessionMessages()
  const p = pending()
  // 决定哪些消息需要渲染
  return msgs.filter(msg => shouldRender(msg, p))
})
```

每个 memo 只追踪它实际读取的信号。如果 `sessionID()` 不变，`sessionMessages` 不会重新计算。

### 3.2.5 withFallback 模式

OpenCode 中一个实用的模式：

```tsx
// packages/app/src/context/settings.tsx
function withFallback<T>(read: () => T | undefined, fallback: T) {
  return createMemo(() => read() ?? fallback)
}

// 使用
fontSize: withFallback(() => store.appearance?.fontSize, defaultSettings.appearance.fontSize),
```

这相当于 React 中 `??` 操作符的响应式版本。

## 3.3 信号 vs Memo 的选择

| 场景 | 使用 |
|------|------|
| 可变状态 | `createSignal` |
| 派生/计算值 | `createMemo` |
| 复杂对象状态 | `createStore`（见第 6 章） |
| 异步数据 | `createResource`（见第 9 章） |

## 3.4 常见陷阱

### 陷阱 1：在信号外读取

```tsx
const [count, setCount] = createSignal(0)

// ❌ 错误：在 effect 外读取，不会建立依赖
const value = count()  // 只读取了初始值
createEffect(() => console.log(value))  // 不会响应 count 变化

// ✅ 正确：在 effect 内读取
createEffect(() => console.log(count()))  // 自动追踪
```

### 陷阱 2：不必要的 Memo

```tsx
// ❌ 过度使用：简单表达式不需要 memo
const doubled = createMemo(() => count() * 2)

// ✅ 直接使用表达式即可
// 在 JSX 中：{count() * 2}
```

`createMemo` 适用于**计算开销大**或**需要缓存引用**的场景。简单的算术运算直接内联即可。

### 陷阱 3：条件性读取

```tsx
// ❌ 条件性读取导致依赖不完整
const display = createMemo(() => {
  if (condition()) {
    return a()  // 仅当 condition() 为 true 时追踪 a
  }
  return b()  // 仅当 condition() 为 false 时追踪 b
})

// ✅ 始终读取所有依赖
const display = createMemo(() => {
  const c = condition()
  const aVal = a()
  const bVal = b()
  return c ? aVal : bVal
})
```

---

**下一章：[副作用与生命周期](04-effects-and-lifecycle.md)**

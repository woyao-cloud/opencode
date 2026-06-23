# 第 12 章：性能优化指南

## 12.1 SolidJS 的默认性能优势

SolidJS 默认已经非常高效，但了解其性能特性有助于避免反模式。

### 12.1.1 自动优化

```tsx
// SolidJS 默认只更新变化的部分
function App() {
  const [count, setCount] = createSignal(0)

  return (
    <div>
      <h1>计数: {count()}</h1>  {/* 只有这个文本节点会更新 */}
      <ExpensiveStaticContent />  {/* 完全不受影响 */}
      <button onClick={() => setCount(c => c + 1)}>+1</button>
    </div>
  )
}
```

在 React 中，`setCount` 会导致整个 `App` 组件重渲染，`ExpensiveStaticContent` 也会被重新执行。在 SolidJS 中，只有 `{count()}` 所在的文本节点被更新。

## 12.2 优化策略

### 12.2.1 使用 createMemo 缓存计算

```tsx
// ❌ 每次读取都重新计算
function ExpensiveList(props) {
  return (
    <For each={props.items()}>
      {(item) => {
        const processed = expensiveProcess(item)  // 每次渲染都执行
        return <div>{processed}</div>
      }}
    </For>
  )
}

// ✅ 使用 createMemo 缓存
function ExpensiveList(props) {
  return (
    <For each={props.items()}>
      {(item) => {
        const processed = createMemo(() => expensiveProcess(item))
        return <div>{processed()}</div>
      }}
    </For>
  )
}
```

### 12.2.2 使用 batch 合并更新

```tsx
// ❌ 多次更新触发多次副作用
setName("Bob")
setAge(31)
setEmail("bob@example.com")
// 每个 set 都触发一次 effect

// ✅ 使用 batch 合并
batch(() => {
  setName("Bob")
  setAge(31)
  setEmail("bob@example.com")
})
// 只触发一次 effect
```

### 12.2.3 使用 reconcile 高效替换数据

```tsx
import { reconcile } from "solid-js/store"

// ❌ 直接替换整个 store
setStore("users", newUsers)  // 所有用户都标记为"变化"

// ✅ 使用 reconcile 进行 diff
setStore("users", reconcile(newUsers, {
  key: "id"  // 按 id 比较，只更新变化的用户
}))
```

### 12.2.4 控制 equals 比较

```tsx
// 默认使用 === 比较
const [count, setCount] = createSignal(0, {
  equals: (a, b) => a === b  // 默认行为
})

// 自定义比较器
const [position, setPosition] = createSignal({ x: 0, y: 0 }, {
  equals: (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1
})

// 强制通知（即使值相同）
const [name, setName] = createSignal("", {
  equals: false  // 每次 set 都通知订阅者
})
```

### 12.2.5 使用 untrack 避免不必要的依赖

```tsx
import { untrack } from "solid-js"

createEffect(() => {
  console.log(count())  // 追踪 count

  // 读取但不追踪
  untrack(() => {
    console.log(theme())  // theme 变化不会触发此 effect
  })
})
```

## 12.3 内存管理

### 12.3.1 及时清理 Effect

```tsx
// ❌ 内存泄漏：定时器未清理
createEffect(() => {
  setInterval(() => {
    console.log(count())
  }, 1000)
})

// ✅ 正确清理
createEffect(() => {
  const timer = setInterval(() => {
    console.log(count())
  }, 1000)
  onCleanup(() => clearInterval(timer))
})
```

### 12.3.2 避免 Store 无限增长

```tsx
// ❌ 消息列表无限增长
const [messages, setMessages] = createStore([])

// 每次收到消息都追加
setMessages(messages.length, newMessage)

// ✅ 限制消息数量
setMessages(produce((msgs) => {
  msgs.push(newMessage)
  if (msgs.length > 1000) {
    msgs.splice(0, msgs.length - 1000)  // 只保留最近 1000 条
  }
}))
```

### 12.3.3 使用 reconcile 清空 Store

```tsx
// packages/app/src/context/file.tsx
createEffect(() => {
  scope()
  batch(() => {
    setStore("file", reconcile({}))  // 高效清空
    tree.reset()
  })
})
```

## 12.4 性能分析工具

### 12.4.1 使用 SolidJS DevTools

```bash
# 安装
npm install -D solid-devtools
```

```tsx
// vite.config.ts
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import devtools from "solid-devtools/vite"

export default defineConfig({
  plugins: [
    devtools(),  // 添加 DevTools
    solid(),
  ],
})
```

### 12.4.2 性能监控

```tsx
// 使用 Performance API 监控
createEffect(() => {
  performance.mark("effect-start")
  // ... 你的代码
  performance.mark("effect-end")
  performance.measure("effect-duration", "effect-start", "effect-end")
})
```

## 12.5 优化检查清单

- [ ] 是否使用了 `createMemo` 缓存昂贵计算？
- [ ] 是否在需要时使用了 `batch` 合并更新？
- [ ] 是否使用 `reconcile` 进行大规模数据替换？
- [ ] 所有定时器和事件监听是否在 `onCleanup` 中清理？
- [ ] Store 是否有无限增长的风险？
- [ ] 是否在不需要响应式的地方使用了 `untrack`？
- [ ] 是否避免了在 `createEffect` 中更新信号导致死循环？
- [ ] 是否使用了 `splitProps` 而不是解构 props？

---

**下一章：[常见模式与解决方案](13-common-patterns.md)**

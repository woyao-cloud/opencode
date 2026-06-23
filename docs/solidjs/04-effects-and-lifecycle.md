# 第 4 章：副作用与生命周期

## 4.1 createEffect

### 4.1.1 基本用法

`createEffect` 是 SolidJS 执行副作用的主要方式。它在首次执行时自动追踪所有读取的信号，并在这些信号变化时重新执行：

```tsx
import { createEffect, createSignal } from "solid-js"

const [count, setCount] = createSignal(0)

createEffect(() => {
  console.log("当前计数:", count())  // 自动追踪 count
})

// 输出: 当前计数: 0（首次执行）
setCount(1)  // 输出: 当前计数: 1
setCount(2)  // 输出: 当前计数: 2
```

### 4.1.2 与 React useEffect 的关键区别

| 特性 | React useEffect | SolidJS createEffect |
|------|----------------|---------------------|
| 执行时机 | 渲染后异步执行 | DOM 更新后同步执行 |
| 依赖管理 | 手动依赖数组 | 运行时自动追踪 |
| 首次执行 | 默认在 mount 后 | 立即执行 |
| 清理时机 | 下次 effect 前或 unmount 时 | 下次 effect 前或 dispose 时 |

### 4.1.3 显式依赖（on）

虽然 SolidJS 自动追踪依赖，但 `on` 函数提供了显式控制：

```tsx
import { createEffect, on } from "solid-js"

// 仅在特定信号变化时触发
createEffect(
  on(
    () => [sessionKey(), turnStart(), messages().length] as const,
    ([key, isWindowed, total], prev) => {
      console.log("会话状态变化:", key, isWindowed, total)
      // prev 是上一次的值
    },
  ),
)
```

`on` 的第二个参数接收 `(current, previous)`，可以访问上一次的值。

### 4.1.4 OpenCode 中的 Effect 模式

**CSS 变量绑定：**

```tsx
// packages/app/src/context/settings.tsx
createEffect(() => {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.style.setProperty("--font-family-mono", monoFontFamily(store.appearance?.mono))
  root.style.setProperty("--font-family-sans", sansFontFamily(store.appearance?.sans))
})
```

**服务器健康检查：**

```tsx
// packages/app/src/app.tsx
createEffect(() => {
  const current_ = current()
  if (!current_) return
  if (props.disableHealthCheck) {
    setState("healthy", true)
    return
  }
  setState("healthy", undefined)
  onCleanup(startHealthPolling(current_))
})
```

## 4.2 onCleanup

### 4.2.1 基本用法

`onCleanup` 注册一个清理函数，在以下时机执行：
- Effect 重新执行前（清理旧依赖）
- 组件卸载时
- 响应式作用域被销毁时

```tsx
import { createEffect, onCleanup } from "solid-js"

createEffect(() => {
  const timer = setInterval(() => {
    console.log("tick")
  }, 1000)

  onCleanup(() => {
    clearInterval(timer)  // 组件卸载或 effect 重新执行时清理
  })
})
```

### 4.2.2 与 React useEffect 返回值的区别

```tsx
// React：通过返回值清理
useEffect(() => {
  const timer = setInterval(tick, 1000)
  return () => clearInterval(timer)  // 返回清理函数
}, [])

// SolidJS：通过 onCleanup 清理
createEffect(() => {
  const timer = setInterval(tick, 1000)
  onCleanup(() => clearInterval(timer))  // 在 effect 内注册清理
})
```

`onCleanup` 的优势在于可以在 effect 的任意位置注册多个清理函数，而不是只能通过 return 注册一个。

### 4.2.3 OpenCode 中的清理模式

**事件监听器清理：**

```tsx
// packages/app/src/context/layout.tsx
onMount(() => {
  const flush = () => batch(() => scroll.flushAll())
  const handleVisibility = () => {
    if (document.visibilityState !== "hidden") return
    flush()
  }

  makeEventListener(window, "pagehide", flush)
  makeEventListener(document, "visibilitychange", handleVisibility)

  onCleanup(() => {
    scroll.dispose()
  })
})
```

**动画清理：**

```tsx
// packages/ui/src/components/motion-spring.tsx
createEffect(() => { source.set(target()) })
onCleanup(() => {
  off()           // 取消 spring 监听
  stop()          // 停止动画
  spring.destroy() // 释放资源
  source.destroy()
})
```

## 4.3 onMount

### 4.3.1 基本用法

`onMount` 是 `createEffect` 的特化版本，仅在组件挂载后执行一次：

```tsx
import { onMount } from "solid-js"

onMount(() => {
  // 组件已挂载到 DOM
  // 只执行一次，不会重新执行
})
```

等价于：

```tsx
createEffect(() => {
  // 首次执行后立即停止追踪
})
```

### 4.3.2 OpenCode 中的 onMount 使用

```tsx
// packages/app/src/context/layout.tsx
onMount(() => {
  const flush = () => batch(() => scroll.flushAll())
  makeEventListener(window, "pagehide", flush)
  makeEventListener(document, "visibilitychange", handleVisibility)

  onCleanup(() => {
    scroll.dispose()
  })
})
```

## 4.4 生命周期对比

| 时机 | React | SolidJS |
|------|-------|---------|
| 组件挂载 | `useEffect(fn, [])` | `onMount(fn)` |
| 组件卸载 | `useEffect(() => fn, [])` 的 return | `onCleanup(fn)` |
| 依赖变化 | `useEffect(fn, [dep])` | `createEffect(fn)`（自动追踪）|
| 每次渲染 | `useEffect(fn)` | 不适用（SolidJS 无重渲染概念）|

## 4.5 常见陷阱

### 陷阱 1：在 createEffect 中更新信号导致死循环

```tsx
const [count, setCount] = createSignal(0)

// ❌ 死循环：effect 读取 count → 更新 count → effect 重新执行
createEffect(() => {
  setCount(count() + 1)
})

// ✅ 使用 createMemo 代替
const doubled = createMemo(() => count() * 2)
```

### 陷阱 2：忘记清理

```tsx
// ❌ 未清理：每次 effect 重新执行都创建新定时器
createEffect(() => {
  const timer = setInterval(() => {
    console.log(count())
  }, 1000)
  // 缺少 onCleanup
})

// ✅ 正确清理
createEffect(() => {
  const timer = setInterval(() => {
    console.log(count())
  }, 1000)
  onCleanup(() => clearInterval(timer))
})
```

### 陷阱 3：在 createEffect 中执行异步操作

```tsx
// ❌ 危险：异步操作在 effect 重新执行时可能产生竞态
createEffect(() => {
  fetch(`/api/user/${id()}`).then(res => {
    setUser(res.data)  // 如果 id 快速变化，可能设置过时的值
  })
})

// ✅ 使用 createResource（见第 9 章）
const [user] = createResource(id, fetchUser)
```

---

**下一章：[控制流组件](05-control-flow.md)**

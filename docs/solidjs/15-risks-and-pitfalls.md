# 第 15 章：风险与陷阱

## 15.1 性能风险

### 15.1.1 过度响应（Over-reactivity）

SolidJS 的细粒度响应式系统虽然高效，但过度使用信号可能导致**过多的更新通知**：

```tsx
// ❌ 风险：每个像素变化都触发更新
const [mousePos, setMousePos] = createSignal({ x: 0, y: 0 })

onMount(() => {
  makeEventListener(window, "mousemove", (e) => {
    setMousePos({ x: e.clientX, y: e.clientY })  // 每秒触发数十次
  })
})

// ✅ 优化：限制更新频率
onMount(() => {
  let ticking = false
  makeEventListener(window, "mousemove", (e) => {
    if (!ticking) {
      requestAnimationFrame(() => {
        setMousePos({ x: e.clientX, y: e.clientY })
        ticking = false
      })
      ticking = true
    }
  })
})
```

### 15.1.2 不必要的信号粒度

```tsx
// ❌ 风险：过度细粒度的信号
const [firstName, setFirstName] = createSignal("")
const [lastName, setLastName] = createSignal("")
const [email, setEmail] = createSignal("")
const [phone, setPhone] = createSignal("")
// ... 每个字段都是独立信号

// ✅ 优化：使用 Store 管理相关状态
const [form, setForm] = createStore({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
})
```

### 15.1.3 信号图过大

当信号图包含数千个节点时，依赖追踪本身可能成为性能瓶颈：

```tsx
// ❌ 风险：大量独立信号
const [items, setItems] = createSignal([])
// 每个 item 都创建独立信号
items().map(item => createSignal(item.value))

// ✅ 优化：使用 Store 管理数组
const [items, setItems] = createStore([])
// 通过路径式 setter 更新
setItems(0, "value", newValue)
```

## 15.2 内存管理风险

### 15.2.1 未清理的 Effect

```tsx
// ❌ 风险：effect 中创建了定时器但未清理
createEffect(() => {
  const timer = setInterval(() => {
    console.log(count())
  }, 1000)
  // 缺少 onCleanup → 组件卸载后定时器仍在运行
})

// ✅ 正确：始终清理
createEffect(() => {
  const timer = setInterval(() => {
    console.log(count())
  }, 1000)
  onCleanup(() => clearInterval(timer))
})
```

### 15.2.2 Store 内存泄漏

```tsx
// ❌ 风险：Store 无限增长
const [events, setEvents] = createStore([])

// 每次事件都追加
onMount(() => {
  makeEventListener(window, "some-event", (e) => {
    setEvents(events.length, e.detail)  // 数组不断增长
  })
})

// ✅ 优化：限制大小
onMount(() => {
  makeEventListener(window, "some-event", (e) => {
    setEvents(produce((evts) => {
      evts.push(e.detail)
      if (evts.length > 100) evts.shift()  // 只保留最近 100 条
    }))
  })
})
```

### 15.2.3 闭包引用

```tsx
// ❌ 风险：闭包持有大对象引用
function HeavyComponent() {
  const [data, setData] = createSignal(largeData)

  createEffect(() => {
    const currentData = data()  // 闭包持有 data 引用
    // 即使组件卸载，只要 effect 存在，data 不会被 GC
  })
}
```

## 15.3 生态风险

### 15.3.1 第三方库兼容性

SolidJS 生态相比 React 较小，某些 React 专属库没有直接替代品：

| 类别 | React 库 | SolidJS 替代 |
|------|---------|-------------|
| 状态管理 | Redux, Zustand | createStore + Context |
| 表单 | React Hook Form | Kobalte TextField |
| 动画 | Framer Motion | motion（通用） |
| 拖拽 | dnd-kit | @thisbeyond/solid-dnd |
| 表格 | React Table | 自定义 |
| 虚拟列表 | react-window | solid-virtual |

### 15.3.2 社区资源

- **Stack Overflow 问题** — React 的 1/10 左右
- **npm 下载量** — React 的 1/100 左右
- **GitHub 星星** — 约 33k（React 约 230k）
- **第三方组件库** — 远少于 React

### 15.3.3 招聘难度

SolidJS 开发者比 React 开发者更难招聘。团队需要投入培训成本。

## 15.4 SSR/SSG 风险

### 15.4.1 水合不匹配

```tsx
// ❌ 风险：客户端和服务端渲染结果不一致
function TimeDisplay() {
  return <div>{new Date().toLocaleString()}</div>
  // 服务端渲染的时间 ≠ 客户端水合的时间
}

// ✅ 正确：使用 createEffect 延迟客户端执行
function TimeDisplay() {
  const [time, setTime] = createSignal("")
  onMount(() => setTime(new Date().toLocaleString()))
  return <div>{time()}</div>
}
```

### 15.4.2 浏览器 API 访问

```tsx
// ❌ 风险：SSR 时访问浏览器 API
const width = window.innerWidth  // SSR 报错

// ✅ 正确：延迟到客户端
const [width, setWidth] = createSignal(0)
onMount(() => setWidth(window.innerWidth))
```

## 15.5 开发体验风险

### 15.5.1 调试难度

SolidJS 的细粒度更新使得调试更具挑战性：

- **React DevTools** 显示组件树和 props 变化
- **SolidJS DevTools** 显示信号图和更新路径（功能仍在完善中）

### 15.5.2 学习曲线

虽然对 React 开发者相对平缓，但仍需理解：

- 信号 vs 状态的概念差异
- 控制流组件 vs JS 表达式的区别
- 组件只执行一次的含义
- 自动依赖追踪的工作原理

## 15.6 风险缓解策略

### 15.6.1 性能监控

```tsx
// 使用 Performance API 监控关键路径
createEffect(() => {
  performance.mark("update-start")
  // ... 更新逻辑
  performance.mark("update-end")
  const measure = performance.measure("update", "update-start", "update-end")
  if (measure.duration > 16) {  // 超过 16ms（60fps 阈值）
    console.warn("更新耗时过长:", measure.duration)
  }
})
```

### 15.6.2 内存泄漏检测

```tsx
// 在开发环境中检测未清理的 effect
if (import.meta.env.DEV) {
  createEffect(() => {
    const timer = setInterval(() => {}, 1000)
    onCleanup(() => {
      clearInterval(timer)
      console.log("effect 已清理")
    })
  })
}
```

### 15.6.3 渐进采用

```tsx
// 在现有项目中渐进采用 SolidJS
// 1. 先在非关键路径使用
// 2. 验证性能和稳定性
// 3. 逐步扩大使用范围

// 通过 Web Components 桥接
class SolidBridge extends HTMLElement {
  connectedCallback() {
    const root = document.createElement("div")
    this.appendChild(root)
    render(() => <SolidComponent />, root)
  }
}
```

## 15.7 风险总结

| 风险类别 | 严重程度 | 发生概率 | 缓解措施 |
|---------|---------|---------|---------|
| 过度响应 | 中 | 中 | 使用 batch、untrack、自定义 equals |
| 内存泄漏 | 高 | 中 | 始终使用 onCleanup |
| 生态不足 | 中 | 高 | 评估第三方库需求 |
| SSR 不匹配 | 高 | 低 | 使用 onMount 延迟浏览器 API |
| 调试困难 | 中 | 中 | 使用 SolidJS DevTools |
| 招聘难度 | 中 | 高 | 团队培训、文档完善 |

---

**下一章：[附录：React → SolidJS 速查表](appendix-cheatsheet.md)**

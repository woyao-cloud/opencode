# 第 13 章：常见模式与解决方案

## 13.1 表单处理

### 13.1.1 受控表单

```tsx
function LoginForm() {
  const [form, setForm] = createStore({
    email: "",
    password: "",
  })

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    console.log("提交:", form.email, form.password)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={form.email}
        onInput={(e) => setForm("email", e.currentTarget.value)}
      />
      <input
        type="password"
        value={form.password}
        onInput={(e) => setForm("password", e.currentTarget.value)}
      />
      <button type="submit">登录</button>
    </form>
  )
}
```

### 13.1.2 使用 Kobalte TextField

```tsx
// packages/ui/src/components/text-field.tsx
import { TextField as KobalteTextField } from "@kobalte/core/text-field"

export function TextField(props) {
  return (
    <KobalteTextField>
      <KobalteTextField.Label>{props.label}</KobalteTextField.Label>
      <KobalteTextField.Input
        value={props.value}
        onInput={props.onInput}
      />
      <KobalteTextField.ErrorMessage>
        {props.error}
      </KobalteTextField.ErrorMessage>
    </KobalteTextField>
  )
}
```

## 13.2 动画

### 13.2.1 使用 motion 库

OpenCode 使用 `motion` 库（通用动画库，非 Framer Motion）实现动画：

```tsx
// packages/ui/src/components/motion-spring.tsx
import { attachSpring, motionValue } from "motion"

export function useSpring(target: () => number, options?) {
  const [value, setValue] = createSignal(target())
  const source = motionValue(value())
  const spring = motionValue(value())

  let stop = attachSpring(spring, source, options)
  let off = spring.on("change", (next: number) => setValue(next))

  createEffect(() => { source.set(target()) })
  onCleanup(() => {
    off()
    stop()
    spring.destroy()
    source.destroy()
  })

  return value
}
```

### 13.2.2 在组件中使用

```tsx
// packages/app/src/pages/session/composer/session-composer-region.tsx
const open = createMemo(() => store.ready && props.state.dock() && !props.state.closing())
const progress = useSpring(() => (open() ? 1 : 0), {
  visualDuration: 0.3,
  bounce: 0,
})
const value = createMemo(() => Math.max(0, Math.min(1, progress())))
```

## 13.3 Refs

### 13.3.1 基本用法

```tsx
function AutoFocus() {
  let inputRef: HTMLInputElement | undefined

  onMount(() => {
    inputRef?.focus()
  })

  return <input ref={inputRef} />
}
```

### 13.3.2 OpenCode 中的 ref 使用

```tsx
// packages/app/src/pages/session/message-timeline.tsx
let head: HTMLDivElement | undefined

createResizeObserver(
  () => head,
  () => {
    if (!head || head.clientWidth <= 0) return
    setBar("ms", pace(head.clientWidth))
  },
)

return <div ref={head}>...</div>
```

## 13.4 拖拽

### 13.4.1 使用 @thisbeyond/solid-dnd

```tsx
// packages/app/src/utils/solid-dnd.tsx
import { DragDropProvider, DragDropSensors, Draggable, Droppable } from "@thisbeyond/solid-dnd"

function SortableList() {
  const [items, setItems] = createStore([{ id: 1, text: "A" }, { id: 2, text: "B" }])

  const onDragEnd = ({ draggable, droppable }) => {
    if (droppable) {
      // 重新排序
      setItems(produce((items) => {
        const from = items.findIndex(i => i.id === draggable.id)
        const to = items.findIndex(i => i.id === droppable.id)
        items.splice(to, 0, items.splice(from, 1)[0])
      }))
    }
  }

  return (
    <DragDropProvider onDragEnd={onDragEnd}>
      <DragDropSensors />
      <For each={items}>
        {(item) => (
          <Draggable id={item.id}>
            <Droppable id={item.id}>
              <div>{item.text}</div>
            </Droppable>
          </Draggable>
        )}
      </For>
    </DragDropProvider>
  )
}
```

## 13.5 国际化

### 13.5.1 OpenCode 的 i18n 实现

```tsx
// packages/app/src/context/language.tsx
import { useLanguage } from "@/context/language"

function MyComponent() {
  const language = useLanguage()

  return (
    <div>
      <p>{language.t("app.server.unreachable", { server: serverName })}</p>
    </div>
  )
}
```

### 13.5.2 使用 @solid-primitives/i18n

```tsx
import { createI18n } from "@solid-primitives/i18n"

const dict = {
  hello: "你好",
  greeting: (name: string) => `你好, ${name}!`,
}

function App() {
  const [t] = createI18n(dict)
  return <h1>{t("greeting", "SolidJS")}</h1>
}
```

## 13.6 与第三方库集成

### 13.6.1 集成非响应式库

```tsx
function ChartComponent(props) {
  let containerRef: HTMLDivElement | undefined
  let chart: Chart | undefined

  onMount(() => {
    chart = new Chart(containerRef!, {
      data: props.data(),
      options: props.options(),
    })
  })

  // 当数据变化时更新图表
  createEffect(() => {
    if (chart) {
      chart.update({
        data: props.data(),
        options: props.options(),
      })
    }
  })

  onCleanup(() => {
    chart?.destroy()
  })

  return <div ref={containerRef} />
}
```

### 13.6.2 集成 React 组件（通过 Web Components）

```tsx
// 不推荐，但必要时可通过 Web Components 桥接
function ReactBridge(props) {
  let containerRef: HTMLDivElement | undefined

  onMount(() => {
    const root = createRoot(containerRef!)
    root.render(<ReactComponent {...props} />)
    onCleanup(() => root.unmount())
  })

  return <div ref={containerRef} />
}
```

## 13.7 代码分割

### 13.7.1 路由级代码分割

```tsx
// packages/app/src/app.tsx
const HomeRoute = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))

// 预加载
if (shouldPreload()) {
  void import("@/pages/session")
}
```

### 13.7.2 组件级代码分割

```tsx
const HeavyComponent = lazy(() => import("./HeavyComponent"))

function App() {
  const [show, setShow] = createSignal(false)

  return (
    <div>
      <button onClick={() => setShow(true)}>显示</button>
      <Suspense fallback={<div>加载中...</div>}>
        <Show when={show()}>
          <HeavyComponent />
        </Show>
      </Suspense>
    </div>
  )
}
```

## 13.8 模式总结

| 场景 | 推荐方案 | 参考 |
|------|---------|------|
| 表单 | `createStore` + Kobalte TextField | 第 6 章、第 10 章 |
| 动画 | `motion` + `useSpring` | 本章 |
| DOM 引用 | `ref` 回调 + `onMount` | 本章 |
| 拖拽 | `@thisbeyond/solid-dnd` | 本章 |
| 国际化 | `@solid-primitives/i18n` | 本章 |
| 第三方库 | `onMount` 初始化 + `createEffect` 更新 | 本章 |
| 代码分割 | `lazy` + `Suspense` | 第 7 章 |

---

**下一章：[React 迁移指南](14-migration-guide.md)**

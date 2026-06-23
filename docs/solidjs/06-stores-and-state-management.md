# 第 6 章：Store 与状态管理

## 6.1 createStore

### 6.1.1 基本用法

`createStore` 是 SolidJS 用于管理**嵌套对象状态**的原语。它提供路径式的 setter，无需展开操作符：

```tsx
import { createStore } from "solid-js/store"

const [state, setState] = createStore({
  user: { name: "Alice", age: 30 },
  ui: { theme: "dark", sidebar: true },
})

// 路径式更新（无需展开）
setState("user", "name", "Bob")
setState("ui", "theme", "light")

// 函数式更新
setState("user", "age", (a) => a + 1)

// 深层路径
setState("user", "profile", "bio", "Hello!")
```

### 6.1.2 与 React useState 的对比

```tsx
// React：需要展开操作符
const [state, setState] = useState({ user: { name: "Alice" }, ui: { theme: "dark" } })
setState(prev => ({
  ...prev,
  user: { ...prev.user, name: "Bob" }
}))

// SolidJS：路径式更新
const [state, setState] = createStore({ user: { name: "Alice" }, ui: { theme: "dark" } })
setState("user", "name", "Bob")
```

### 6.1.3 OpenCode 中的 Store 使用

OpenCode 大量使用 `createStore` 管理全局状态：

```tsx
// packages/app/src/context/layout.tsx
const [sidebar, setSidebar] = createStore({
  opened: false,
  width: 344,
})

const [terminal, setTerminal] = createStore({
  height: 280,
  opened: false,
})

const [sessionTabs, setSessionTabs] = createStore<SessionTabs>({
  active: undefined,
  all: [],
})

// 使用路径式 setter
setSidebar("opened", true)
setSidebar("width", 400)
setTerminal("opened", (x) => !x)
```

## 6.2 produce

### 6.2.1 基本用法

`produce` 提供 Immer 风格的**可变式更新语法**，特别适合数组操作：

```tsx
import { produce } from "solid-js/store"

const [todos, setTodos] = createStore([
  { id: 1, text: "学习 SolidJS", done: false },
  { id: 2, text: "写示例代码", done: false },
])

// 使用 produce 进行可变式更新
setTodos(produce((draft) => {
  draft.push({ id: 3, text: "发布应用", done: false })
  draft[0].done = true
  draft.splice(1, 1)  // 删除第二个元素
}))
```

### 6.2.2 OpenCode 中的 produce 使用

```tsx
// packages/app/src/context/layout.tsx
// 删除 pendingMessage
setStore(
  "sessionView",
  sessionKey,
  produce((draft) => {
    delete draft.pendingMessage
    delete draft.pendingMessageAt
  }),
)

// 数组重排（拖拽排序）
setStore(
  "sessionTabs",
  session,
  "all",
  produce((opened) => {
    opened.splice(to, 0, opened.splice(index, 1)[0])
  }),
)
```

## 6.3 reconcile

### 6.3.1 基本用法

`reconcile` 用于**高效替换** store 中的部分数据。它通过 diff 算法只更新变化的部分：

```tsx
import { reconcile } from "solid-js/store"

// 完全替换 store
setStore("file", reconcile(newFileData))

// 只更新变化的部分
setStore("users", reconcile(newUserList, {
  key: "id"  // 按 id 比较，只更新变化的用户
}))
```

### 6.3.2 OpenCode 中的 reconcile 使用

```tsx
// packages/app/src/context/file.tsx
createEffect(() => {
  scope()
  batch(() => {
    setStore("file", reconcile({}))  // 清空并重置文件 store
    tree.reset()
  })
})
```

## 6.4 batch

### 6.4.1 基本用法

`batch` 将多个状态更新合并为一次通知，避免中间状态触发不必要的副作用：

```tsx
import { batch } from "solid-js"

// 无 batch：每个 set 都触发 effect
setName("Bob")    // 触发 effect
setAge(31)        // 再次触发 effect

// 使用 batch：只触发一次 effect
batch(() => {
  setName("Bob")
  setAge(31)
})
```

### 6.4.2 OpenCode 中的 batch 使用

```tsx
// packages/app/src/context/server.tsx
batch(() => {
  setStore("list", existing, conn)
  setState("active", ServerConnection.key(conn))
})
```

## 6.5 Context 模式

### 6.5.1 createSimpleContext

OpenCode 封装了 `createSimpleContext` 工具，简化 Context 的使用：

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

### 6.5.2 OpenCode 的 Provider 层级

```tsx
// packages/app/src/app.tsx
function AppShellProviders(props: ParentProps) {
  return (
    <SettingsProvider>
      <PermissionProvider>
        <LayoutProvider>
          <NotificationProvider>
            <ModelsProvider>
              <CommandProvider>
                <HighlightsProvider>
                  <Layout>{props.children}</Layout>
                </HighlightsProvider>
              </CommandProvider>
            </ModelsProvider>
          </NotificationProvider>
        </LayoutProvider>
      </PermissionProvider>
    </SettingsProvider>
  )
}
```

### 6.5.3 使用 Context

```tsx
// 在组件中使用
const layout = useLayout()
layout.sidebar.width  // 读取
layout.setSidebar("opened", true)  // 更新
```

## 6.6 状态管理策略对比

| 场景 | 方案 | 说明 |
|------|------|------|
| 局部组件状态 | `createSignal` | 简单值、计数器、开关 |
| 嵌套对象状态 | `createStore` | 深层路径更新 |
| 数组操作 | `createStore` + `produce` | 可变式数组更新 |
| 数据替换 | `createStore` + `reconcile` | 高效 diff 更新 |
| 全局共享状态 | `createStore` + Context | Provider 注入 |
| 服务器状态 | `@tanstack/solid-query` | 缓存、重试、失效 |
| 持久化状态 | `@solid-primitives/storage` | localStorage 同步 |

## 6.7 常见陷阱

### 陷阱 1：直接修改 Store

```tsx
const [state, setState] = createStore({ count: 0 })

// ❌ 错误：直接修改不会触发更新
state.count = 1

// ✅ 正确：使用 setter
setState("count", 1)
```

### 陷阱 2：不必要的 Store 嵌套

```tsx
// ❌ 过度嵌套
const [state, setState] = createStore({
  a: { b: { c: { d: "deep" } } }
})

// ✅ 扁平化
const [state, setState] = createStore({
  d: "deep"
})
```

### 陷阱 3：在 createEffect 中读取 Store 的时机

```tsx
// ✅ 正确：在 effect 内读取 store 值
createEffect(() => {
  console.log(state.count)  // 自动追踪 state.count
})
```

---

**下一章：[组件与 Props](07-components-and-props.md)**

# 第 7 章：组件与 Props

## 7.1 组件基础

### 7.1.1 函数组件

SolidJS 的组件与 React 类似，都是函数，但有一个关键区别：

```tsx
// React：组件每次重渲染都重新执行
function MyComponent({ name }) {
  return <h1>Hello, {name}!</h1>
}

// SolidJS：组件只执行一次
function MyComponent(props) {
  return <h1>Hello, {props.name}!</h1>
}
```

在 SolidJS 中，**组件函数只执行一次**。后续更新通过细粒度的信号更新实现，而不是重新执行整个组件函数。

### 7.1.2 Props 是对象

SolidJS 的 `props` 是一个**包含 getter 的对象**，每个 prop 都是一个访问器：

```tsx
function Greeting(props) {
  // props.name 不是值，而是 getter
  // 在 JSX 中使用：{props.name}
  // 在 effect 中使用：createEffect(() => console.log(props.name))
  return <h1>Hello, {props.name}!</h1>
}
```

这意味着你不能解构 props：

```tsx
// ❌ 错误：解构会丢失响应性
function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>  // name 是静态值，不会响应更新
}

// ✅ 正确：通过 props 对象访问
function Greeting(props) {
  return <h1>Hello, {props.name}!</h1>
}
```

## 7.2 splitProps

### 7.2.1 基本用法

`splitProps` 将 props 按 key 分组，解决 props 解构的问题：

```tsx
import { splitProps } from "solid-js"

function Button(props) {
  const [local, rest] = splitProps(props, ["variant", "size", "class"])

  return (
    <button
      class={`btn btn-${local.variant} btn-${local.size} ${local.class}`}
      {...rest}  // 剩余的 HTML 属性
    >
      {props.children}
    </button>
  )
}
```

### 7.2.2 OpenCode 中的 splitProps 使用

```tsx
// packages/ui/src/components/button.tsx
export function Button(props: ButtonProps) {
  const [split, rest] = splitProps(props, [
    "variant", "size", "icon", "class", "classList",
  ])

  return (
    <Kobalte.Button
      {...rest}
      data-component="button"
      data-size={split.size || "normal"}
      data-variant={split.variant || "secondary"}
    >
      <Show when={split.icon}>
        <Icon name={split.icon!} size="small" />
      </Show>
      {props.children}
    </Kobalte.Button>
  )
}
```

### 7.2.3 多层 splitProps

```tsx
function ComplexComponent(props) {
  const [a, b, c] = splitProps(props, ["x", "y"], ["z"], ["w"])
  // a: { x, y }
  // b: { z }
  // c: { w, ...rest }
}
```

## 7.3 Dynamic

### 7.3.1 基本用法

`Dynamic` 用于动态渲染组件，类似于 React 的 `<Component is={...}>`：

```tsx
import { Dynamic } from "solid-js/web"

// 根据变量动态渲染不同组件
<Dynamic component={iconMap[type()]} size={24} />
```

### 7.3.2 OpenCode 中的 Dynamic 使用

```tsx
// packages/app/src/app.tsx
<Dynamic
  component={props.router ?? Router}
  root={(routerProps) => (
    <RouterRoot appChildren={props.children}>
      {routerProps.children}
    </RouterRoot>
  )}
>
  <Route path="/" component={HomeRoute} />
  <Route path="/:dir" component={DirectoryLayout}>
    <Route path="/session/:id?" component={SessionRoute} />
  </Route>
</Dynamic>
```

## 7.4 lazy

### 7.4.1 基本用法

`lazy` 用于代码分割，与 `Suspense` 配合使用：

```tsx
import { lazy } from "solid-js"

const HomePage = lazy(() => import("./pages/Home"))
const AboutPage = lazy(() => import("./pages/About"))

// 在路由中使用
<Route path="/" component={HomePage} />
<Route path="/about" component={AboutPage} />
```

### 7.4.2 OpenCode 中的 lazy 使用

```tsx
// packages/app/src/app.tsx
const HomeRoute = lazy(() => import("@/pages/home"))
const loadSession = () => import("@/pages/session")
const Session = lazy(loadSession)

// 预加载
if (typeof location === "object" && /\/session(?:\/|$)/.test(location.pathname)) {
  void loadSession()
}
```

## 7.5 ParentProps

### 7.5.1 基本用法

`ParentProps` 是 SolidJS 的类型工具，用于声明包含 `children` 的组件：

```tsx
import { type ParentProps } from "solid-js"

function Card(props: ParentProps) {
  return (
    <div class="card">
      {props.children}
    </div>
  )
}
```

### 7.5.2 OpenCode 中的 ParentProps 使用

```tsx
// packages/app/src/app.tsx
function AppShellProviders(props: ParentProps) {
  return (
    <SettingsProvider>
      <PermissionProvider>
        <LayoutProvider>
          {props.children}
        </LayoutProvider>
      </PermissionProvider>
    </SettingsProvider>
  )
}
```

## 7.6 组件模式对比

| 模式 | React | SolidJS |
|------|-------|---------|
| 组件执行 | 每次渲染重新执行 | 只执行一次 |
| Props | 普通对象 | 包含 getter 的对象 |
| Props 解构 | 安全 | 丢失响应性 |
| Props 分割 | 手动 `...rest` | `splitProps` |
| 动态组件 | `<Component is={...}>` | `<Dynamic component={...}>` |
| 代码分割 | `React.lazy` | `lazy` |
| Children 类型 | `ReactNode` | `ParentProps` |

## 7.7 常见陷阱

### 陷阱 1：解构 Props

```tsx
// ❌ 错误：解构后失去响应性
function BadComponent({ name }) {
  return <h1>{name}</h1>
}

// ✅ 正确：通过 props 访问
function GoodComponent(props) {
  return <h1>{props.name}</h1>
}
```

### 陷阱 2：在回调中使用 Props

```tsx
// ❌ 错误：回调中读取的是旧值
function BadComponent(props) {
  return <button onClick={() => handleClick(props.id)}>点击</button>
}

// ✅ 正确：在回调中通过 props 访问
function GoodComponent(props) {
  return <button onClick={() => handleClick(props.id)}>点击</button>
}
// 实际上在 SolidJS 中这是正确的，因为 props.id 是 getter
```

### 陷阱 3：Props 默认值

```tsx
// ❌ 错误：默认值在解构时计算，不会响应更新
function BadComponent(props) {
  const { size = "medium" } = props
  return <div class={`size-${size}`} />
}

// ✅ 正确：使用 createMemo
function GoodComponent(props) {
  const size = createMemo(() => props.size ?? "medium")
  return <div class={`size-${size()}`} />
}
```

---

**下一章：[路由与导航](08-routing-and-navigation.md)**

# 第 8 章：路由与导航

## 8.1 @solidjs/router

SolidJS 使用 `@solidjs/router` 作为官方路由库，API 设计与 `react-router-dom` 类似但有差异。

### 8.1.1 基本用法

```tsx
import { Route, Router } from "@solidjs/router"
import { lazy } from "solid-js"

const Home = lazy(() => import("./pages/Home"))
const About = lazy(() => import("./pages/About"))
const User = lazy(() => import("./pages/User"))

function App() {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/user/:id" component={User} />
    </Router>
  )
}
```

### 8.1.2 嵌套路由

```tsx
<Router>
  <Route path="/" component={Layout}>
    <Route path="/" component={Home} />
    <Route path="/about" component={About} />
    <Route path="/user/:id" component={User} />
  </Route>
</Router>
```

## 8.2 OpenCode 的路由配置

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
    <Route path="/" component={SessionIndexRoute} />
    <Route path="/session/:id?" component={SessionRoute} />
  </Route>
</Dynamic>
```

路由结构：
- `/` — 首页
- `/:dir` — 项目目录布局
  - `/:dir/` — 重定向到 session
  - `/:dir/session/:id?` — 会话页面（可选 ID）

## 8.3 路由参数

### 8.3.1 useParams

```tsx
import { useParams } from "@solidjs/router"

function SessionPage() {
  const params = useParams()
  // params.id 是响应式的
  const sessionID = createMemo(() => params.id)
  // ...
}
```

### 8.3.2 useNavigate

```tsx
import { useNavigate } from "@solidjs/router"

function HomePage() {
  const navigate = useNavigate()

  return (
    <button onClick={() => navigate("/project/session/new")}>
      新建会话
    </button>
  )
}
```

## 8.4 与 React Router 的对比

| 特性 | react-router-dom | @solidjs/router |
|------|-----------------|-----------------|
| 路由配置 | `<Routes><Route>` | `<Router><Route>` |
| 参数 | `useParams()` | `useParams()` |
| 导航 | `useNavigate()` | `useNavigate()` |
| 链接 | `<Link>` | `<Link>` / `<A>` |
| 导航守卫 | 自定义 | `<Route preload>` |
| 数据加载 | `loader` | `<Route preload>` |

## 8.5 常见陷阱

### 陷阱 1：params 不是响应式

```tsx
// ❌ 错误：params.id 在组件外读取
function SessionPage() {
  const params = useParams()
  const id = params.id  // 静态值
  return <div>{id}</div>
}

// ✅ 正确：在 JSX 或 createMemo 中使用
function SessionPage() {
  const params = useParams()
  return <div>{params.id}</div>  // 响应式
}
```

---

**下一章：[异步与服务器状态](09-async-and-server-state.md)**

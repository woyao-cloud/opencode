# 第 9 章：异步与服务器状态

## 9.1 createResource

### 9.1.1 基本用法

`createResource` 是 SolidJS 处理异步数据的原语，与 `Suspense` 配合使用：

```tsx
import { createResource, Suspense } from "solid-js"

async function fetchUser(id) {
  const res = await fetch(`/api/users/${id}`)
  return res.json()
}

function UserProfile(props) {
  const [user] = createResource(() => props.id, fetchUser)

  return (
    <Suspense fallback={<div>加载中...</div>}>
      <div>{user()?.name}</div>
    </Suspense>
  )
}
```

### 9.1.2 参数说明

```tsx
// 第一个参数：信号源（变化时重新获取）
// 第二个参数：异步获取函数
// 第三个参数：选项
const [data, { refetch, mutate }] = createResource(
  source,     // 信号或返回信号的函数
  fetcher,    // 异步函数
  {
    initialValue: defaultValue,  // 初始值（避免 loading 状态）
    name: "resource-name",       // 调试名称
  },
)
```

### 9.1.3 返回值

```tsx
const [data, resource] = createResource(fetcher)

// data — 响应式数据访问器
data()           // 当前值
data.loading     // 是否加载中
data.error       // 错误信息

// resource — 控制方法
resource.refetch()  // 重新获取
resource.mutate(v)  // 直接设置值（乐观更新）
```

### 9.1.4 OpenCode 中的 createResource 使用

```tsx
// packages/app/src/app.tsx
const [startupHealthCheck, healthCheckActions] = createResource(() =>
  props.disableHealthCheck
    ? true
    : Effect.gen(function* () {
        if (!server.current) return true
        const { http, type } = server.current
        while (true) {
          const res = yield* Effect.promise(() => checkServerHealth(http))
          if (res.healthy) return true
          if (checkMode() === "background" || type === "http") return false
        }
      }).pipe(
        Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.succeed(false) }),
        Effect.ensuring(Effect.sync(() => setCheckMode("background"))),
        Effect.runPromise,
      ),
)
```

```tsx
// packages/app/src/context/language.tsx
const [dict] = createResource(locale, loadDict, {
  initialValue: dicts.get(initial) ?? base,
})
```

```tsx
// packages/app/src/pages/session.tsx
const [sessionSync] = createResource(
  () => [sdk.directory, params.id] as const,
  ([directory, id]) => {
    return syncSession(directory, id)
  },
)
```

## 9.2 @tanstack/solid-query

### 9.2.1 基本用法

OpenCode 使用 `@tanstack/solid-query` 管理服务器状态，API 与 React 版本类似：

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { useMutation } from "@tanstack/solid-query"

// 创建 QueryClient
const client = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnReconnect: false,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  },
})

// Provider
<QueryClientProvider client={client}>
  {props.children}
</QueryClientProvider>
```

### 9.2.2 useMutation

```tsx
// packages/app/src/pages/session/message-timeline.tsx
const shareMutation = useMutation(() => ({
  mutationFn: (id: string) =>
    globalSDK.client.session.share({
      sessionID: id,
      directory: sdk.directory,
    }),
  onError: (err) => {
    console.error("分享失败", err)
  },
}))

// 使用
shareMutation.mutate(sessionId)
shareMutation.isPending  // 响应式布尔值
```

### 9.2.3 与 React Query 的对比

```tsx
// React Query
const { mutate, isPending } = useMutation({
  mutationFn: (id) => api.share(id),
})

// Solid Query（API 相同，但返回值是响应式的）
const mutation = useMutation(() => ({
  mutationFn: (id: string) => api.share(id),
}))
mutation.isPending  // 响应式信号
```

## 9.3 异步模式对比

| 场景 | React | SolidJS |
|------|-------|---------|
| 数据获取 | `useEffect` + `fetch` | `createResource` |
| 加载状态 | 手动管理 | `Suspense` + `fallback` |
| 缓存 | `@tanstack/react-query` | `@tanstack/solid-query` |
| 乐观更新 | `useMutation.onMutate` | `resource.mutate` |
| 竞态处理 | 手动（AbortController） | 自动（信号源变化取消旧请求） |

## 9.4 常见陷阱

### 陷阱 1：在 createEffect 中执行异步操作

```tsx
// ❌ 错误：手动管理异步操作容易产生竞态
createEffect(() => {
  fetch(`/api/user/${id()}`).then(res => {
    setUser(res.data)  // 如果 id 快速变化，可能设置过时的值
  })
})

// ✅ 正确：使用 createResource 自动处理
const [user] = createResource(id, fetchUser)
```

### 陷阱 2：忘记 Suspense

```tsx
// ❌ 错误：createResource 需要 Suspense
function Profile() {
  const [user] = createResource(id, fetchUser)
  return <div>{user()?.name}</div>  // 如果 user 未加载，user() 是 undefined
}

// ✅ 正确：包裹 Suspense
function Profile() {
  const [user] = createResource(id, fetchUser)
  return (
    <Suspense fallback={<Spinner />}>
      <div>{user()?.name}</div>
    </Suspense>
  )
}
```

---

**下一章：[生态与工具链](10-ecosystem-and-tooling.md)**

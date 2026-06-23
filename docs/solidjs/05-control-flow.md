# 第 5 章：控制流组件

## 5.1 为什么是组件而非表达式？

React 使用 JavaScript 表达式控制渲染流程：

```tsx
// React：JS 表达式
{condition && <Component />}
{array.map(item => <Item key={item.id} data={item} />)}
{error ? <Error msg={error} /> : null}
```

SolidJS 使用**控制流组件**：

```tsx
// SolidJS：控制流组件
<Show when={condition()}><Component /></Show>
<For each={items()}>{(item) => <Item data={item} />}</For>
<Show when={error()} fallback={null}><Error msg={error()} /></Show>
```

**为什么？** 因为 SolidJS 没有虚拟 DOM。在 React 中，`array.map()` 每次重渲染都返回新的 JSX 数组，React 通过 key 进行 diff。在 SolidJS 中，`<For>` 组件内部维护了列表项的增删改查逻辑，只更新变化的部分。

## 5.2 Show

### 5.2.1 基本用法

`Show` 是条件渲染组件，相当于 React 的 `{condition && <Component/>}` 或三元表达式：

```tsx
import { Show } from "solid-js"

// 基本条件渲染
<Show when={isLoggedIn()}>
  <UserProfile />
</Show>

// 带 fallback
<Show when={isLoggedIn()} fallback={<LoginButton />}>
  <UserProfile />
</Show>
```

### 5.2.2 OpenCode 中的 Show 使用

```tsx
// packages/app/src/app.tsx
<Show
  when={startupHealthCheck()}
  fallback={
    <ConnectionError
      onRetry={() => { void healthCheckActions.refetch() }}
      onServerSelected={(key) => {
        setCheckMode("blocking")
        server.setActive(key)
        void healthCheckActions.refetch()
      }}
    />
  }
>
  {props.children}
</Show>
```

### 5.2.3 Show 的 keyed 模式

```tsx
// 非 keyed：when 为 truthy 时渲染
<Show when={user()}>
  <UserProfile name={user().name} />
</Show>

// keyed：when 的值作为 key，变化时销毁重建
<Show when={user()} keyed>
  <UserProfile name={user().name} />
</Show>
```

`keyed` 模式在 `when` 值变化时销毁子组件并重新创建，适用于需要重置内部状态的场景。

## 5.3 For

### 5.3.1 基本用法

`For` 是列表渲染组件，相当于 React 的 `array.map()`：

```tsx
import { For } from "solid-js"

<For each={items()}>
  {(item, index) => (
    <div>
      <span>{index()}. {item.name}</span>
    </div>
  )}
</For>
```

关键特性：
- **`each`** — 接收一个数组信号
- **第一个参数** — 当前项的值
- **第二个参数** — 当前索引的**信号**（`() => number`）

### 5.3.2 与 React map 的区别

```tsx
// React：每次重渲染重新执行 map
{items.map((item, index) => (
  <Item key={item.id} data={item} index={index} />
))}

// SolidJS：只更新变化的项
<For each={items()}>
  {(item, index) => (
    <Item data={item} index={index()} />
  )}
</For>
```

注意 `index` 在 SolidJS 中是一个**信号**，因为列表项可能被插入或删除，索引会动态变化。

### 5.3.3 OpenCode 中的 For 使用

```tsx
// packages/app/src/pages/session/message-timeline.tsx
<For each={rendered()}>
  {(messageID) => (
    <div id={props.anchor(messageID)} data-message-id={messageID}>
      <SessionTurn
        sessionID={sessionID() ?? ""}
        messageID={messageID}
        // ...
      />
    </div>
  )}
</For>
```

```tsx
// packages/app/src/app.tsx
<For each={others()}>
  {(conn) => {
    const key = ServerConnection.key(conn)
    return (
      <button
        type="button"
        onClick={() => props.onServerSelected?.(key)}
      >
        <span>{serverName(conn)}</span>
      </button>
    )
  }}
</For>
```

## 5.4 Index

### 5.4.1 基本用法

`Index` 与 `For` 类似，但**按索引追踪**而非按值追踪：

```tsx
import { Index } from "solid-js"

// For：按值追踪（适合稳定 key 的列表）
<For each={items()}>
  {(item) => <div>{item.name}</div>}
</For>

// Index：按索引追踪（适合固定长度的列表）
<Index each={items()}>
  {(item) => <div>{item().name}</div>}
</Index>
```

区别：
- `For` — 第一个参数是值本身，按值比较决定是否更新
- `Index` — 第一个参数是**访问器函数**，按索引比较决定是否更新

### 5.4.2 何时使用 Index

```tsx
// 适合 Index：固定长度的数组，值可能变化
const [items, setItems] = createSignal([1, 2, 3])

// 更新第二个元素
setItems([1, 10, 3])

// For：按值比较，1 和 3 不变，2→10 更新
// Index：按索引比较，索引 0 和 2 不变，索引 1 更新
```

## 5.5 Switch / Match

### 5.5.1 基本用法

`Switch` / `Match` 是多分支条件渲染，相当于 `switch` 语句：

```tsx
import { Switch, Match } from "solid-js"

<Switch fallback={<DefaultView />}>
  <Match when={status() === "loading"}>
    <Spinner />
  </Match>
  <Match when={status() === "error"}>
    <ErrorView message={error()} />
  </Match>
  <Match when={status() === "success"}>
    <DataView data={result()} />
  </Match>
</Switch>
```

### 5.5.2 OpenCode 中的 Switch/Match 使用

```tsx
// packages/app/src/pages/session/file-tabs.tsx
<Switch>
  <Match when={props.action}>
    {props.action}
  </Match>
  <Match when={true}>
    <Kobalte.CloseButton as={IconButton} icon="close" variant="ghost" />
  </Match>
</Switch>
```

## 5.6 Suspense

### 5.6.1 基本用法

`Suspense` 与 `createResource` 配合使用，在异步数据加载时显示 fallback：

```tsx
import { Suspense } from "solid-js"

<Suspense fallback={<div class="spinner">加载中...</div>}>
  <UserProfile userId={props.id} />
</Suspense>
```

### 5.6.2 OpenCode 中的 Suspense 使用

```tsx
// packages/app/src/app.tsx
<Suspense
  fallback={
    <div class="h-dvh w-screen flex flex-col items-center justify-center bg-background-base">
      <Splash class="w-16 h-20 opacity-50 animate-pulse" />
    </div>
  }
>
  {props.children}
</Suspense>
```

## 5.7 ErrorBoundary

### 5.7.1 基本用法

`ErrorBoundary` 捕获子组件中的错误并显示 fallback：

```tsx
import { ErrorBoundary } from "solid-js"

<ErrorBoundary
  fallback={(error, reset) => (
    <div>
      <p>出错了: {error.message}</p>
      <button onClick={reset}>重试</button>
    </div>
  )}
>
  <MyComponent />
</ErrorBoundary>
```

### 5.7.2 OpenCode 中的 ErrorBoundary 使用

```tsx
// packages/app/src/app.tsx
<ErrorBoundary
  fallback={(error) => {
    Sentry.captureException(error)
    return <ErrorPage error={error} />
  }}
>
  <QueryProvider>
    <DialogProvider>
      {props.children}
    </DialogProvider>
  </QueryProvider>
</ErrorBoundary>
```

## 5.8 Dynamic

### 5.8.1 基本用法

`Dynamic` 用于动态渲染组件，相当于 React 的 `<Component component={...}>`：

```tsx
import { Dynamic } from "solid-js/web"

<Dynamic component={MyComponent} name="SolidJS" />
// 等价于 <MyComponent name="SolidJS" />
```

### 5.8.2 OpenCode 中的 Dynamic 使用

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

## 5.9 控制流对比总结

| 场景 | React | SolidJS |
|------|-------|---------|
| 条件渲染 | `{cond && <C/>}` | `<Show when={cond}>` |
| 条件+else | `{cond ? <A/> : <B/>}` | `<Show when={cond} fallback={<B/>}>` |
| 列表渲染 | `{arr.map(fn)}` | `<For each={arr()}>{fn}</For>` |
| 索引列表 | `{arr.map((v,i)=>...)}` | `<Index each={arr()}>{(v,i)=>...}</Index>` |
| 多分支 | 三元/if-else | `<Switch><Match when={c}>` |
| 异步加载 | `React.lazy` + `Suspense` | `lazy` + `Suspense` |
| 错误处理 | `ErrorBoundary` | `ErrorBoundary` |
| 动态组件 | `<Component is={...}>` | `<Dynamic component={...}>` |

---

**下一章：[Store 与状态管理](06-stores-and-state-management.md)**

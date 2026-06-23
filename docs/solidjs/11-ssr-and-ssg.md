# 第 11 章：SSR 与 SSG

## 11.1 Astro + SolidJS Islands

OpenCode 的 Web 站点使用 **Astro** 构建，通过 `@astrojs/solid-js` 集成 SolidJS 组件作为交互式岛屿。

### 11.1.1 配置

```tsx
// packages/web/astro.config.mjs
import { defineConfig } from "astro/config"
import solid from "@astrojs/solid-js"
import starlight from "@astrojs/starlight"

export default defineConfig({
  integrations: [
    solid(),      // SolidJS 岛屿支持
    starlight(),  // 文档主题
  ],
})
```

### 11.1.2 什么是岛屿架构？

岛屿架构（Islands Architecture）是一种**部分水合**模式：

```
┌─────────────────────────────────────┐
│         静态 HTML（Astro）            │
│  ┌──────────┐     ┌──────────┐      │
│  │ SolidJS  │     │ 静态内容  │      │
│  │  岛屿 A  │     │          │      │
│  │ (交互式)  │     └──────────┘      │
│  └──────────┘                        │
│  ┌──────────┐     ┌──────────┐      │
│  │ 静态内容  │     │ SolidJS  │      │
│  │          │     │  岛屿 B  │      │
│  └──────────┘     │ (交互式)  │      │
│                   └──────────┘      │
└─────────────────────────────────────┘
```

- 页面在构建时生成**静态 HTML**
- 只有需要交互的组件才会在客户端**水合**为 SolidJS 组件
- 未水合的组件保持为纯静态 HTML，零 JavaScript 开销

### 11.1.3 OpenCode 中的 SolidJS 岛屿

```tsx
// packages/web/src/components/Share.tsx
// 这是一个 SolidJS 岛屿组件
import { onMount, onCleanup } from "solid-js"

export function ShareButton(props) {
  let buttonRef

  onMount(() => {
    // 仅在客户端执行
    buttonRef.addEventListener("click", handleShare)
    onCleanup(() => buttonRef.removeEventListener("click", handleShare))
  })

  return <button ref={buttonRef}>分享</button>
}
```

在 Astro 页面中使用：

```astro
---
// pages/share.astro
import ShareButton from "../components/Share.tsx"
---

<html>
  <body>
    <h1>分享页面</h1>
    <!-- 只有这个组件会水合为 SolidJS -->
    <ShareButton client:load />
  </body>
</html>
```

### 11.1.4 水合指令

| 指令 | 时机 | 适用场景 |
|------|------|---------|
| `client:load` | 页面加载后立即水合 | 首屏可见的交互组件 |
| `client:idle` | 浏览器空闲时水合 | 非首屏组件 |
| `client:visible` | 组件进入视口时水合 | 懒加载组件 |
| `client:media` | 满足媒体查询时水合 | 响应式组件 |
| `client:only` | 仅客户端渲染 | 需要浏览器 API 的组件 |

## 11.2 与 Next.js 的对比

| 特性 | Next.js (React) | Astro + SolidJS |
|------|----------------|-----------------|
| 渲染模式 | SSG/SSR/ISR | SSG/SSR |
| 水合策略 | 全量水合 | 岛屿部分水合 |
| 客户端 JS | 整个页面水合 | 仅交互组件水合 |
| 构建输出 | React 运行时 | 原生 HTML + 小型 SolidJS 运行时 |
| 适用场景 | 全功能应用 | 内容型网站 |

## 11.3 常见陷阱

### 陷阱 1：在 SSR 中使用浏览器 API

```tsx
// ❌ 错误：SSR 时没有 window/document
function Component() {
  const width = window.innerWidth  // SSR 报错
  return <div>{width}</div>
}

// ✅ 正确：使用 createEffect 延迟执行
function Component() {
  const [width, setWidth] = createSignal(0)
  onMount(() => setWidth(window.innerWidth))
  return <div>{width()}</div>
}
```

### 陷阱 2：岛屿间通信

```tsx
// ❌ 错误：岛屿间不能直接共享状态
// 岛屿 A
<Counter client:load />
// 岛屿 B
<Display client:load />  // 无法访问 Counter 的状态

// ✅ 正确：通过自定义事件或全局 store 通信
// 使用 CustomEvent
window.dispatchEvent(new CustomEvent("count-change", { detail: count }))
```

---

**下一章：[性能优化指南](12-optimization-guide.md)**

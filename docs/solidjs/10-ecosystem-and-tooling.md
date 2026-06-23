# 第 10 章：生态与工具链

## 10.1 Kobalte（Headless UI）

Kobalte 是 SolidJS 生态中的 **Radix UI 等价物**，提供无障碍的 headless UI 原语。

### 10.1.1 OpenCode 中的 Kobalte 使用

OpenCode 的 UI 组件库基于 Kobalte 构建：

```tsx
// packages/ui/src/components/button.tsx
import { Button as KobalteButton } from "@kobalte/core/button"

export function Button(props: ButtonProps) {
  const [split, rest] = splitProps(props, ["variant", "size", "icon", "class"])
  return (
    <KobalteButton
      {...rest}
      data-component="button"
      data-size={split.size || "normal"}
      data-variant={split.variant || "secondary"}
    >
      <Show when={split.icon}>
        <Icon name={split.icon!} size="small" />
      </Show>
      {props.children}
    </KobalteButton>
  )
}
```

### 10.1.2 Kobalte 组件列表

OpenCode 使用的 Kobalte 组件：

| 组件 | 用途 | 文件 |
|------|------|------|
| `Button` | 按钮 | `packages/ui/src/components/button.tsx` |
| `Dialog` | 对话框 | `packages/ui/src/components/dialog.tsx` |
| `Popover` | 弹出框 | `packages/ui/src/components/popover.tsx` |
| `Select` | 选择器 | `packages/ui/src/components/select.tsx` |
| `Switch` | 开关 | `packages/ui/src/components/switch.tsx` |
| `Accordion` | 手风琴 | `packages/ui/src/components/accordion.tsx` |
| `DropdownMenu` | 下拉菜单 | `packages/ui/src/components/dropdown-menu.tsx` |
| `ContextMenu` | 右键菜单 | `packages/ui/src/components/context-menu.tsx` |
| `HoverCard` | 悬停卡片 | `packages/ui/src/components/hover-card.tsx` |
| `TextField` | 文本输入 | `packages/ui/src/components/text-field.tsx` |
| `Checkbox` | 复选框 | `packages/ui/src/components/checkbox.tsx` |
| `Collapsible` | 折叠面板 | `packages/ui/src/components/collapsible.tsx` |

### 10.1.3 与 Radix UI 的对比

```tsx
// React + Radix UI
import * as Dialog from "@radix-ui/react-dialog"
<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
  <Dialog.Trigger>打开</Dialog.Trigger>
  <Dialog.Content>内容</Dialog.Content>
</Dialog.Root>

// SolidJS + Kobalte
import { Dialog as KobalteDialog } from "@kobalte/core/dialog"
<KobalteDialog open={isOpen()} onOpenChange={setIsOpen}>
  <KobalteDialog.Trigger>打开</KobalteDialog.Trigger>
  <KobalteDialog.Content>内容</KobalteDialog.Content>
</KobalteDialog>
```

## 10.2 @solid-primitives

`@solid-primitives` 是 SolidJS 官方维护的工具库，相当于 React 生态中的 `react-use` 或 `ahooks`。

### 10.2.1 OpenCode 使用的 Primitives

**makeEventListener** — 自动清理的事件监听：

```tsx
// packages/app/src/context/layout.tsx
import { makeEventListener } from "@solid-primitives/event-listener"

onMount(() => {
  makeEventListener(window, "pagehide", flush)
  makeEventListener(document, "visibilitychange", handleVisibility)
  // 自动在 onCleanup 时移除监听器
})
```

**createResizeObserver** — 响应式尺寸观察：

```tsx
// packages/app/src/pages/session/message-timeline.tsx
import { createResizeObserver } from "@solid-primitives/resize-observer"

createResizeObserver(
  () => head,
  () => {
    if (!head || head.clientWidth <= 0) return
    setBar("ms", pace(head.clientWidth))
  },
)
```

**makeTimer** — 自动清理的定时器：

```tsx
// packages/app/src/pages/session/message-timeline.tsx
import { makeTimer } from "@solid-primitives/timer"

createEffect(() => {
  if (workingStatus() !== "hiding") return
  setTimeoutDone(false)
  makeTimer(() => setTimeoutDone(true), 260, setTimeout)
})
```

**makePersisted** — 自动持久化 Store：

```tsx
// packages/app/src/utils/persist.ts
import { makePersisted } from "@solid-primitives/storage"

const [state, setState, init] = makePersisted(store, {
  name: config.key,
  storage: localStorage,
})
```

### 10.2.2 其他可用 Primitives

| Primitive | 用途 | 等价 React 库 |
|-----------|------|--------------|
| `@solid-primitives/i18n` | 国际化 | `react-i18next` |
| `@solid-primitives/media` | 媒体查询 | `useMediaQuery` |
| `@solid-primitives/scroll` | 滚动管理 | 自定义 |
| `@solid-primitives/websocket` | WebSocket | 自定义 |
| `@solid-primitives/audio` | 音频 | 自定义 |
| `@solid-primitives/event-bus` | 事件总线 | 自定义 |
| `@solid-primitives/active-element` | 焦点追踪 | 自定义 |

## 10.3 Vite 构建工具

### 10.3.1 配置

```tsx
// packages/app/vite.config.ts
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [desktopPlugin, sentry] as any,
  server: { host: "0.0.0.0", allowedHosts: true, port: 3000 },
  build: { target: "esnext", sourcemap: true },
})
```

### 10.3.2 依赖

```json
// packages/app/package.json
{
  "dependencies": {
    "solid-js": "catalog:",
    "vite-plugin-solid": "catalog:",
    "@kobalte/core": "catalog:",
    "@solidjs/router": "catalog:",
    "@solidjs/meta": "catalog:",
    "@tanstack/solid-query": "5.91.4",
    "@solid-primitives/event-listener": "2.4.5",
    "@solid-primitives/resize-observer": "2.1.5",
    "@solid-primitives/timer": "1.4.4",
    "@solid-primitives/storage": "catalog:",
    "@solid-primitives/i18n": "2.2.1",
    "@solid-primitives/media": "2.3.3",
    "@solid-primitives/scroll": "2.1.3",
    "@solid-primitives/websocket": "1.3.1",
    "@solid-primitives/audio": "1.4.2",
    "@solid-primitives/event-bus": "1.1.2",
    "@solid-primitives/active-element": "2.1.3",
    "@sentry/solid": "catalog:",
    "@thisbeyond/solid-dnd": "0.7.5",
    "tailwindcss": "catalog:",
    "@tailwindcss/vite": "catalog:"
  }
}
```

## 10.4 与 React 生态对比

| 类别 | React | SolidJS |
|------|-------|---------|
| 构建 | Vite + `@vitejs/plugin-react` | Vite + `vite-plugin-solid` |
| 路由 | `react-router-dom` | `@solidjs/router` |
| 元数据 | `react-helmet` | `@solidjs/meta` |
| 服务端状态 | `@tanstack/react-query` | `@tanstack/solid-query` |
| Headless UI | `@radix-ui/react-*` | `@kobalte/core` |
| 工具库 | `react-use` / `ahooks` | `@solid-primitives/*` |
| 拖拽 | `dnd-kit` | `@thisbeyond/solid-dnd` |
| 错误追踪 | `@sentry/react` | `@sentry/solid` |
| 动画 | `framer-motion` | `motion`（通用） |
| 样式 | Tailwind CSS | Tailwind CSS（通用） |

---

**下一章：[SSR 与 SSG](11-ssr-and-ssg.md)**

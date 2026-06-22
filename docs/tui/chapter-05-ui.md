# 第 5 章 · 基础 UI 组件（ui/）

## 5.1 目录概览

`ui/` 包含 TUI 中最底层的 UI 组件——对话框容器、文本输入、选择列表、通知提示等。10 个文件，是 `component/` 和 `routes/` 的构建基础。

| 文件 | 功能 |
|------|------|
| `dialog.tsx` | **对话框容器**：DialogProvider + useDialog Hook |
| `dialog-alert.tsx` | 警告对话框（单按钮） |
| `dialog-confirm.tsx` | 确认对话框（双按钮：确认/取消） |
| `dialog-prompt.tsx` | 文本输入对话框 |
| `dialog-select.tsx` | 选择列表对话框 |
| `dialog-help.tsx` | 帮助对话框 |
| `dialog-export-options.tsx` | 导出选项对话框 |
| `toast.tsx` | Toast 通知提示 |
| `link.tsx` | 可点击的超链接组件 |
| `spinner.ts` | 旋转进度动画（纯逻辑，无 JSX） |

## 5.2 事件流转

```text
component/ 或 routes/ 调用 dialog.show() / dialog.replace()
    │
    ▼
┌─ dialog.tsx ───────────────────────────────────────────────────┐
│  DialogProvider 管理对话框栈                                     │
│                                                                 │
│  对话框渲染流程:                                                  │
│  ① dialog.show(<Component/>) 或 dialog.replace(<Component/>)  │
│  ② 组件入栈 → 全屏渲染（覆盖当前页面）                            │
│  ③ 用户操作 → 组件调用 onClose / onConfirm                     │
│  ④ 组件出栈 → 恢复之前的页面                                     │
│                                                                 │
│  Toast 渲染流程:                                                 │
│  ① toast.show({ message, variant })                            │
│  ② 入栈 → 右上角弹出                                            │
│  ③ 自动消失 (超时) 或手动关闭                                    │
└─────────────────────────────────────────────────────────────────┘
```

## 5.3 关键文件详解

### dialog.tsx — 对话框容器

**功能**：对话框系统的核心。提供 `DialogProvider`（全局对话框容器）和 `useDialog()` Hook（打开/关闭对话框的 API）。

**自然语言解释**：Dialog 体系是一个"栈"——每个对话框入栈时覆盖前一个，关闭时出栈恢复。`useDialog()` 返回三个方法：
- `show(component)`：在栈顶显示对话框
- `replace(component)`：替换栈顶对话框
- `clear()`：清空对话框栈

Dialog 使用 `@opentui/core` 的渲染能力，在终端中创建覆盖整个屏幕的渲染层。对话框通常有半透明背景遮罩，内容居中显示。

### dialog-alert.tsx / dialog-confirm.tsx

**功能**：简单对话框——alert 只有确认按钮，confirm 有确认和取消两个按钮。

**自然语言解释**：这两个是最简单的对话框。Alert 用于"通知"场景（如"Session 创建失败"），Confirm 用于"确认"场景（如"确定要删除这个会话吗？"）。它们基于 `dialog.tsx` 的 DialogProvider 渲染。

### dialog-prompt.tsx — 文本输入对话框

**功能**：允许用户在对话框中输入文本。

**自然语言解释**：当需要用户输入文本（如重命名会话、输入 MCP 服务器 URL）时使用。它渲染一个单行文本输入框，用户输入后按 Enter 确认，按 Esc 取消。结果通过 `onConfirm(text)` 回调返回。

### dialog-select.tsx — 选择列表对话框

**功能**：显示选项列表，用户用 ↑↓ 键选择，Enter 确认。

**自然语言解释**：当需要用户从多个选项中选一个（如选择 Agent、Model、主题）时使用。它渲染一个可滚动的选项列表，高亮当前选中项。支持键盘导航（↑↓）、搜索过滤（键入文字）、快速选择（Enter）。

### toast.tsx — Toast 通知

**功能**：右上角弹出短暂通知，自动消失。

**自然语言解释**：Toast 用于非阻塞通知——如"Session 创建成功"、"文件已保存"。它在屏幕右上角弹出，几秒后自动消失。支持不同 variant（success/error/warning/info）显示不同颜色。通过 `ToastProvider` + `useToast()` 使用。

### link.tsx — 超链接组件

**功能**：在终端中渲染可点击的超链接。

**自然语言解释**：现代终端支持 OSC 8 超链接协议。`link.tsx` 利用这个能力，在终端中渲染真正的可点击链接（按住 Ctrl+Click 打开浏览器）。用于显示会话分享链接、文档链接等。

### spinner.ts — 旋转动画

**功能**：纯逻辑的加载动画帧生成器。

**自然语言解释**：`spinner.ts` 不渲染任何 JSX，只导出动画帧生成函数。它使用终端 Braille 字符（⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏）创建旋转动画效果。组件通过 `useRenderer()` 获取渲染器，按帧率更新动画帧。

## 5.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createSignal` | `dialog.tsx` — 对话框栈状态 |
| `createMemo` | `dialog-select.tsx` — 过滤后的选项列表 |
| `createEffect` | `toast.tsx` — 自动消失计时器 |
| `Show` / `For` | 各处 — 条件/列表渲染 |
| `onMount` / `onCleanup` | `spinner.ts` — 动画帧生命周期 |

## 5.5 本章小结

`ui/` 是 TUI 的"砖块"——最底层的 UI 组件。Dialog 体系提供栈式对话框管理，Alert/Confirm/Prompt/Select 覆盖了终端交互的常见模式，Toast 提供非阻塞通知，Link 利用终端 OSC 8 协议实现超链接，Spinner 提供纯逻辑的动画帧生成。这些组件不依赖业务逻辑，是纯粹的可复用 UI 构建块。

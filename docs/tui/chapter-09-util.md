# 第 9 章 · 工具函数（util/）

## 9.1 目录概览

`util/` 包含 TUI 专用的工具函数——剪贴板、编辑器集成、音频播放、滚动优化等。10 个文件。

| 文件 | 功能 |
|------|------|
| `clipboard.ts` | 系统剪贴板读写 |
| `editor.ts` | 外部编辑器集成（VSCode、Zed、Vim 等） |
| `audio.ts` | 音频播放（通知音效） |
| `scroll.ts` | 滚动加速算法 |
| `selection.ts` | 文本选择处理 |
| `signal.ts` | SolidJS 信号增强工具（淡入动画等） |
| `transcript.ts` | 对话转录（导出会话内容） |
| `model.ts` | 模型查询工具（从 Provider 列表查找 Model） |
| `provider-origin.ts` | Provider 来源判断（内置 vs 用户安装） |
| `revert-diff.ts` | Diff 解析与回滚 |

## 9.2 事件流转

`util/` 中的工具函数不直接参与事件流转。它们是**纯工具**——被 `component/` 和 `routes/` 中的组件调用，辅助完成特定功能。

```text
component/prompt/index.tsx
    │
    │  用户按 Ctrl+V 粘贴
    ▼
┌─ clipboard.ts ──────────────────────────────────────────────────┐
│  Clipboard.paste()                                              │
│    → 读取系统剪贴板                                              │
│    → 检测二进制内容 (图片)                                        │
│    → 返回文本或 base64                                           │
└─────────────────────────────────────────────────────────────────┘

component/prompt/index.tsx
    │
    │  用户按 Ctrl+E 打开外部编辑器
    ▼
┌─ editor.ts ─────────────────────────────────────────────────────┐
│  Editor.open(filePath)                                          │
│    → 检测可用编辑器 (VSCode/Zed/Vim/...$EDITOR)                  │
│    → 打开编辑器                                                   │
│    → 监听文件变化 → 返回编辑内容                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 9.3 关键文件详解

### clipboard.ts — 剪贴板

**功能**：跨平台的系统剪贴板读写。

**自然语言解释**：终端应用访问剪贴板需要平台特定的方法。`clipboard.ts` 封装了这些差异——macOS 用 `pbcopy/pbpaste`，Linux 用 `xclip` 或 `wl-copy`，Windows 用 PowerShell 命令。它还处理二进制内容（如图片粘贴）——检测到图片数据时转换为 base64 编码，作为 FilePart 发送给 AI。

### editor.ts — 外部编辑器集成

**功能**：允许用户在外部编辑器中编辑 Prompt 输入。

**自然语言解释**：当用户在 Prompt 中按 `Ctrl+E` 时，TUI 将当前输入内容写入临时文件，在外部编辑器中打开（VSCode、Zed、Vim 等）。用户编辑完成后保存文件，TUI 读取文件内容并更新 Prompt 输入框。这种"外部编辑"模式对于编写长 Prompt 或代码片段非常方便。

编辑器选择优先级：`$EDITOR` 环境变量 > `$VISUAL` > 自动检测（VSCode/Zed/Vim）。

### audio.ts — 音频播放

**功能**：播放通知音效。

**自然语言解释**：当 AI 完成响应或发生错误时，TUI 可以播放音效通知。`audio.ts` 使用系统音频 API 播放简短音效——macOS 用 `afplay`，Linux 用 `paplay` 或 `aplay`，Windows 用 PowerShell。音频文件通过 base64 内嵌在代码中。

### scroll.ts — 滚动优化

**功能**：终端滚动加速算法，让长列表浏览更流畅。

**自然语言解释**：终端渲染速度有限，逐行滚动会显得卡顿。`scroll.ts` 实现了滚动加速——当用户快速滚动时，跳过中间帧，直接跳到目标位置。这种优化在浏览长消息列表和文件树时特别重要。

### signal.ts — SolidJS 信号增强

**功能**：提供淡入动画等 SolidJS 信号增强工具。

**自然语言解释**：`createFadeIn(duration)` 创建一个随时间线性变化的值（从 0 到 1），用于组件淡入动画。组件通过 `useRenderer()` 获取帧渲染器，在每帧更新信号值。

### transcript.ts — 对话转录

**功能**：导出会话内容为纯文本。

**自然语言解释**：用户可以通过命令面板导出当前会话的完整对话记录。`transcript.ts` 从 `sync.data.message` 和 `sync.data.part` 中读取消息和 Part，格式化为 Markdown 文本，写入文件或复制到剪贴板。

### model.ts / provider-origin.ts

**功能**：从 Provider 列表中查找 Model 信息，判断 Provider 来源。

### revert-diff.ts

**功能**：解析 Diff 输出，用于文件回滚操作。

## 9.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createSignal` | `signal.ts` — 动画信号 |
| `createEffect` | `editor.ts` — 文件变化监听 |

## 9.5 本章小结

`util/` 是 TUI 的"工具箱"——提供剪贴板、编辑器集成、音频播放、滚动优化等跨平台工具函数。它们不直接参与事件流转，但被 `component/` 和 `routes/` 中的组件频繁调用。每个工具函数封装了平台差异，为上层组件提供统一的 API。

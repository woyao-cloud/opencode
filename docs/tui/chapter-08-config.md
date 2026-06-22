# 第 8 章 · TUI 配置（config/）

## 8.1 目录概览

`config/` 管理 TUI 的外观和行为配置——主题、快捷键、布局等。5 个文件。

| 文件 | 功能 |
|------|------|
| `tui.ts` | **核心**：TUI 配置的 Schema 定义、加载、解析 |
| `tui-schema.ts` | 配置项的类型定义 |
| `keybind.ts` | 快捷键绑定系统 |
| `tui-migrate.ts` | 配置迁移（旧格式→新格式） |
| `cwd.ts` | 工作目录配置 |

## 8.2 事件流转

TUI 配置不直接参与 Worker ↔ 主线程的事件流转。配置是**静态数据**——在 TUI 启动时加载，然后通过 Context 提供给所有组件。

```text
thread.ts 启动
    │
    │  TuiConfig.get()
    ▼
┌─ tui.ts ───────────────────────────────────────────────────────┐
│  ① 读取配置文件:                                                │
│     · 全局: ~/.config/opencode/tui.json                        │
│     · 项目: .opencode/tui.json                                 │
│                                                                 │
│  ② 合并配置: 项目配置覆盖全局配置                                 │
│                                                                 │
│  ③ Schema 验证: 使用 tui-schema.ts 中的类型定义                 │
│                                                                 │
│  ④ 迁移旧格式: tui-migrate.ts 处理旧版本配置                     │
│                                                                 │
│  ⑤ 返回 TuiConfig.Resolved 对象                                 │
└─────────────────────────────────────────────────────────────────┘
    │
    │  传入 tui() 函数 → TuiConfigProvider → 所有组件可用
    ▼
┌─ tui-config.tsx ───────────────────────────────────────────────┐
│  TuiConfigProvider 将配置注入 Context                            │
│  useTuiConfig() → 组件读取配置                                   │
└─────────────────────────────────────────────────────────────────┘
```

## 8.3 关键文件详解

### tui.ts — 配置核心

**功能**：定义 TUI 配置的完整 Schema，加载和合并多层配置。

**自然语言解释**：TUI 配置包含以下大类：
- **主题**：颜色方案、字体、间距
- **快捷键**：所有操作的键盘绑定
- **布局**：侧边栏宽度、面板可见性
- **行为**：自动保存、确认对话框、动画开关

配置从两个来源加载：全局（`~/.config/opencode/tui.json`）和项目（`.opencode/tui.json`）。项目配置覆盖全局配置。加载后的配置经过 Schema 验证（确保字段类型正确），然后通过 `TuiConfigProvider` 注入 Context。

### keybind.ts — 快捷键系统

**功能**：管理所有 TUI 操作的键盘快捷键。

**自然语言解释**：opencode TUI 的快捷键系统支持：
- **单键**：如 `Enter` 提交、`Esc` 取消
- **组合键**：如 `Ctrl+P` 命令面板、`Ctrl+C` 复制
- **Leader 键序列**：如 `Ctrl+X` → `A` 切换 Agent（类似 Vim 的 leader key）
- **平台差异**：Windows 和 macOS 的快捷键自动适配（如 macOS 用 `Cmd` 替代 `Ctrl`）

每个快捷键绑定到一个"命令"（如 `prompt.submit`、`command.palette.show`）。组件通过 `useOpencodeKeymap()` 注册和处理快捷键。

### tui-migrate.ts — 配置迁移

**功能**：将旧版本（v1）的 TUI 配置迁移到新格式。

**自然语言解释**：opencode 的 TUI 配置格式随版本演进。`tui-migrate.ts` 检测旧格式配置，自动转换为新格式。例如，v1 的 `theme` 字段被迁移到 v2 的 `theme.name` 格式。迁移在配置加载时自动执行，对用户透明。

### cwd.ts — 工作目录

**功能**：管理 TUI 当前显示的工作目录。

## 8.4 涉及的 SolidJS 模式

| 模式 | 使用位置 |
|------|---------|
| `createSimpleContext` | `tui-config.tsx` — TUI 配置的 Context |
| `createMemo` | 各处 — 从配置派生计算值（如当前主题颜色） |

## 8.5 本章小结

`config/` 是 TUI 的"设置面板"。`tui.ts` 定义配置 Schema 并加载多层配置，`keybind.ts` 管理快捷键绑定，`tui-migrate.ts` 处理版本迁移。配置在 TUI 启动时加载，通过 Context 提供给所有组件。组件通过 `useTuiConfig()` 读取配置，通过 `useOpencodeKeymap()` 注册和处理快捷键。

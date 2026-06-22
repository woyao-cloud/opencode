# 附录 · 组件树全景图 + 事件类型速查 + 文件索引

## A. 组件树全景图

```text
<App>                                          ← app.tsx
│
├─ <ThemeProvider>                             ← context/theme.tsx
│   └─ <SDKProvider>                           ← context/sdk.tsx
│       └─ <SyncProvider>                      ← context/sync.tsx (事件消费核心)
│           └─ <LocalProvider>                 ← context/local.tsx
│               └─ <ProjectProvider>           ← context/project.tsx
│                   └─ <RouteProvider>         ← context/route.tsx
│                       │
│                       ├─ <Home/>             ← routes/home.tsx
│                       │   ├─ 会话列表
│                       │   ├─ <tips-view/>    ← feature-plugins/home/tips-view.tsx
│                       │   └─ <footer/>       ← feature-plugins/home/footer.tsx
│                       │
│                       └─ <Session/>          ← routes/session/index.tsx
│                           ├─ <Prompt/>       ← component/prompt/index.tsx
│                           │   ├─ @mention 自动补全
│                           │   ├─ 输入历史 (↑↓)
│                           │   └─ 编辑器上下文
│                           ├─ <MessageTimeline/>
│                           │   ├─ 用户消息
│                           │   ├─ AI 文本回复
│                           │   ├─ 工具调用 (内联展示)
│                           │   └─ 推理过程 (斜体)
│                           ├─ <Footer/>       ← routes/session/footer.tsx
│                           │   ├─ Agent 名称
│                           │   ├─ Model 名称
│                           │   └─ Token 统计
│                           └─ <Sidebar/>      ← routes/session/sidebar.tsx
│                               ├─ 文件树     ← feature-plugins/sidebar/context.tsx
│                               ├─ 文件变更   ← feature-plugins/sidebar/files.tsx
│                               ├─ Todo 列表  ← feature-plugins/sidebar/todo.tsx
│                               ├─ LSP 状态   ← feature-plugins/sidebar/lsp.tsx
│                               └─ MCP 状态   ← feature-plugins/sidebar/mcp.tsx
│
├─ <DialogProvider>                            ← ui/dialog.tsx
│   └─ (按需渲染的对话框)
│       ├─ DialogAlert                         ← ui/dialog-alert.tsx
│       ├─ DialogConfirm                       ← ui/dialog-confirm.tsx
│       ├─ DialogPrompt                        ← ui/dialog-prompt.tsx
│       ├─ DialogSelect                        ← ui/dialog-select.tsx
│       ├─ DialogAgent                         ← component/dialog-agent.tsx
│       ├─ DialogModel                         ← component/dialog-model.tsx
│       ├─ DialogTheme                         ← component/dialog-theme-list.tsx
│       ├─ DialogSessionList                   ← component/dialog-session-list.tsx
│       ├─ Permission 对话框                   ← routes/session/permission.tsx
│       └─ Question 对话框                     ← routes/session/question.tsx
│
├─ <ToastProvider>                             ← ui/toast.tsx
│   └─ (按需弹出的 Toast 通知)
│
└─ <PluginSlots/>                              ← plugin/slots.tsx
    └─ (插件注册的自定义组件)
```

## B. TUI 消费的事件类型速查

| 事件类型 | 触发时机 | sync.tsx 处理 | 影响的组件 |
|---------|---------|-------------|-----------|
| `message.updated` | 消息创建/更新 | 更新 `message[sessionID]` | MessageTimeline, Home |
| `message.part.updated` | Part 更新 | 更新 `part[messageID]` | MessageTimeline, Footer |
| `session.updated` | 会话元数据更新 | 更新 `session` 列表 | Home, Footer |
| `session.status` | 会话状态变化 | 更新 `session_status[sessionID]` | Footer (busy/idle) |
| `session.error` | 会话错误 | 收集错误信息 | Toast, Footer |
| `permission.asked` | 权限请求 | 更新 `permission[sessionID]` | permission.tsx 对话框 |
| `permission.replied` | 权限回复 | 移除权限请求 | permission.tsx 关闭 |
| `question.asked` | 提问请求 | 更新 `question[sessionID]` | question.tsx 对话框 |
| `question.replied` | 提问回复 | 移除提问请求 | question.tsx 关闭 |
| `server.instance.disposed` | 实例销毁 | 重新初始化 | 全部重载 |
| `tool.completed` | 工具执行完成 | (通过 part.updated) | MessageTimeline |
| `tool.failed` | 工具执行失败 | (通过 part.updated) | MessageTimeline |
| `compaction.completed` | 压缩完成 | (通过 message.updated) | MessageTimeline |
| `agent.switched` | Agent 切换 | (通过 message.updated) | Footer |
| `model.switched` | Model 切换 | (通过 message.updated) | Footer |

## C. 文件索引

### 入口文件
| 文件 | 功能 |
|------|------|
| `app.tsx` | `tui()` 函数，组装完整组件树，调用 `render()` |
| `thread.ts` | `TuiThreadCommand`，启动双线程架构 |
| `worker.ts` | Worker 线程入口 |
| `event.ts` | TUI 全局事件类型定义 |

### context/ (19 .ts/.tsx)
| 文件 | 功能 |
|------|------|
| `sync.tsx` | 全局数据 Store + 事件消费 |
| `event.ts` | EventSource 封装 |
| `route.tsx` | 路由状态 |
| `theme.tsx` | 主题系统 |
| `local.tsx` | 本地状态 (Agent/Model) |
| `sdk.tsx` | SDK 客户端实例 |
| `project.tsx` | 项目信息 |
| `args.tsx` | 命令行参数 |
| `kv.tsx` | 键值存储 |
| `exit.tsx` | 退出逻辑 |
| `editor.ts` / `editor-zed.ts` | 编辑器集成 |
| `thinking.ts` | 思考模式 |
| `directory.ts` | 目录过滤 |
| `command-palette.tsx` | 命令面板 |
| `path-format.tsx` | 路径格式化 |
| `tui-config.tsx` | TUI 配置 Context |
| `prompt.tsx` | Prompt 全局状态 |
| `aggregate-failures.ts` | 聚合错误处理 |
| `helper.tsx` | createSimpleContext 工厂 |

### routes/ (11)
| 文件 | 功能 |
|------|------|
| `home.tsx` | 首页 |
| `session/index.tsx` | 会话主视图 |
| `session/footer.tsx` | 底部状态栏 |
| `session/sidebar.tsx` | 侧边栏 |
| `session/permission.tsx` | 权限对话框 |
| `session/question.tsx` | 提问对话框 |
| `session/dialog-message.tsx` | 消息操作 |
| `session/dialog-timeline.tsx` | 时间线导航 |
| `session/dialog-subagent.tsx` | Subagent 状态 |
| `session/dialog-fork-from-timeline.tsx` | Fork 对话框 |
| `session/subagent-footer.tsx` | Subagent Footer |

### component/ (23 .tsx)
| 文件 | 功能 |
|------|------|
| `prompt/index.tsx` | Prompt 输入框 (~1500行) |
| `prompt/autocomplete.tsx` | @mention 补全 |
| `prompt/history.tsx` | 输入历史 |
| `prompt/stash.tsx` | 暂存机制 |
| `prompt/frecency.tsx` | 频率排序 |
| `prompt/traits.ts` | 模式检测 |
| `dialog-*.tsx` (15个) | 各种选择/配置对话框 |
| `logo.tsx` | Logo 动画 |
| `spinner.tsx` | 加载动画 |
| `todo-item.tsx` | Todo 列表项 |
| `error-component.tsx` | 错误边界 |
| `startup-loading.tsx` | 启动画面 |
| `use-connected.tsx` | 连接状态 |
| `bg-pulse.tsx` | 背景动画 |
| `border.tsx` | 边框渲染 |
| `plugin-route-missing.tsx` | 路由缺失提示 |
| `workspace-label.tsx` | Workspace 标签 |

### ui/ (10)
| 文件 | 功能 |
|------|------|
| `dialog.tsx` | 对话框容器 |
| `dialog-alert.tsx` | 警告对话框 |
| `dialog-confirm.tsx` | 确认对话框 |
| `dialog-prompt.tsx` | 文本输入对话框 |
| `dialog-select.tsx` | 选择列表对话框 |
| `dialog-help.tsx` | 帮助对话框 |
| `dialog-export-options.tsx` | 导出选项 |
| `toast.tsx` | Toast 通知 |
| `link.tsx` | 超链接 |
| `spinner.ts` | 旋转动画 (纯逻辑) |

### plugin/ (5)
| 文件 | 功能 |
|------|------|
| `api.tsx` | TuiPluginApi 实现 |
| `runtime.ts` | 插件运行时 |
| `slots.tsx` | 插槽系统 |
| `internal.ts` | 内置插件注册 |
| `command-shim.ts` | v1 兼容 |

### feature-plugins/ (13)
| 文件 | 功能 |
|------|------|
| `sidebar/context.tsx` | 文件树 |
| `sidebar/files.tsx` | 文件变更 |
| `sidebar/todo.tsx` | Todo 列表 |
| `sidebar/lsp.tsx` | LSP 状态 |
| `sidebar/mcp.tsx` | MCP 状态 |
| `sidebar/footer.tsx` | 侧边栏底部 |
| `home/tips.tsx` + `tips-view.tsx` | 首页提示 |
| `home/footer.tsx` | 首页 Footer |
| `system/notifications.ts` | 系统通知 |
| `system/plugins.tsx` | 插件管理 |
| `system/session-v2.tsx` | V2 Session |
| `system/which-key.tsx` | 快捷键面板 |

### config/ (5)
| 文件 | 功能 |
|------|------|
| `tui.ts` | 配置核心 |
| `tui-schema.ts` | 类型定义 |
| `keybind.ts` | 快捷键系统 |
| `tui-migrate.ts` | 配置迁移 |
| `cwd.ts` | 工作目录 |

### util/ (10)
| 文件 | 功能 |
|------|------|
| `clipboard.ts` | 剪贴板 |
| `editor.ts` | 外部编辑器 |
| `audio.ts` | 音频播放 |
| `scroll.ts` | 滚动优化 |
| `selection.ts` | 文本选择 |
| `signal.ts` | 信号增强 |
| `transcript.ts` | 对话转录 |
| `model.ts` | 模型查询 |
| `provider-origin.ts` | Provider 来源 |
| `revert-diff.ts` | Diff 解析 |

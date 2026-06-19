# 附录 D：错误代码参考

> opencode 常见错误类型、来源与处理方式。

---

## D.1 LLM 调用错误

| 错误 | 来源 | HTTP 状态码 | 处理方式 |
|------|------|-------------|----------|
| `context_overflow` | LLM 提供商 | 400 | 触发 Compaction（压缩对话历史） |
| `rate_limit` | LLM 提供商 | 429 | 指数退避重试（2s → 4s → 8s） |
| `api_key_expired` | LLM 提供商 | 401 | 提示用户更新 API Key，不重试 |
| `permission_denied` | LLM 提供商 | 403 | 提示用户检查权限，不重试 |
| `server_error` | LLM 提供商 | 5xx | 指数退避重试 |
| `network_timeout` | 网络层 | — | 指数退避重试 |
| `chunk_timeout` | SSE 流 | — | 中断当前请求，重试 |

## D.2 权限错误

| 错误 | 来源 | 处理方式 |
|------|------|----------|
| `doom_loop` | SessionProcessor | 弹出确认对话框，用户决定继续或中断 |
| `permission_denied` | Permission 系统 | 操作被拒绝，AI 收到拒绝通知 |
| `permission_rejected` | 用户 | 用户点击"拒绝"，操作被阻止 |
| `permission_corrected` | 用户 | 用户拒绝但提供了修正建议 |

## D.3 会话错误

| 错误 | 来源 | 处理方式 |
|------|------|----------|
| `session_not_found` | Session.Service | 提示用户会话不存在 |
| `session_busy` | SessionStatus | 等待当前操作完成或创建新会话 |
| `message_not_found` | MessageV2 | 内部错误，记录日志 |
| `part_not_found` | MessageV2 | 内部错误，记录日志 |

## D.4 工具错误

| 错误 | 来源 | 处理方式 |
|------|------|----------|
| `tool_not_found` | ToolRegistry | AI 调用了不存在的工具，返回错误给 LLM |
| `tool_execution_failed` | Tool.execute | 将错误信息返回给 LLM，让 LLM 决定下一步 |
| `tool_timeout` | Tool.execute | 中断工具执行，返回超时错误给 LLM |
| `tool_validation_failed` | Schema.decodeUnknownEffect | 返回参数验证错误给 LLM |

## D.5 系统错误

| 错误 | 来源 | 处理方式 |
|------|------|----------|
| `init_error` | AISDK.Service | 提供商初始化失败，提示用户检查配置 |
| `provider_not_found` | Provider.Service | 提示用户检查提供商配置 |
| `model_not_found` | Provider.Service | 提示用户检查模型配置 |
| `config_invalid` | Config.Service | 提示用户检查配置文件格式 |
| `database_error` | Storage | 内部错误，记录日志，尝试恢复 |
| `snapshot_error` | Snapshot | Git 操作失败，记录日志，不影响主流程 |

## D.6 错误处理决策树

```
错误发生
├─ 可重试？（429 / 5xx / 网络超时）
│   ├─ 有 retry-after 头 → 使用提供商建议的等待时间
│   └─ 无 retry-after 头 → 指数退避（2s → 4s → 8s → ... 最多 30s）
├─ 需用户介入？（401 / 403 / doom_loop）
│   └─ 提示用户，暂停执行，等待用户操作
├─ 可自动恢复？（context_overflow）
│   └─ 触发 Compaction，自动压缩后继续
└─ 不可恢复？（配置错误、数据损坏）
    └─ 记录日志，优雅退出，提示用户
```

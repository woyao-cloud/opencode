# 附录 A：OpenCode 配置详解

> 完整配置项说明，基于 `packages/opencode/src/config/config.ts` 和 `RuntimeFlags`。

---

## A.1 配置文件位置

opencode 的配置文件位于 `~/.opencode/config.json`（全局）或 `<project>/.opencode/config.json`（项目级）。项目级配置覆盖全局配置。

## A.2 完整配置项

### providers — 提供商配置

```jsonc
{
  "providers": {
    "anthropic": {
      "enabled": true,
      "apiKey": "sk-ant-...",      // 或从环境变量 ANTHROPIC_API_KEY 读取
      "baseURL": "https://api.anthropic.com"  // 可选，自定义 API 端点
    },
    "openai": {
      "enabled": true,
      "apiKey": "sk-...",
      "baseURL": "https://api.openai.com"
    },
    "google": {
      "enabled": false,
      "apiKey": "..."
    },
    "groq": {
      "enabled": false,
      "apiKey": "..."
    }
    // 支持 20+ 提供商
  }
}
```

### model — 模型选择

```jsonc
{
  "model": {
    "provider": "anthropic",       // 默认提供商
    "name": "claude-sonnet-4"      // 默认模型
  }
}
```

### compaction — 压缩配置

```jsonc
{
  "compaction": {
    "auto": true,                  // 是否自动压缩（默认 true）
    "reserved": 20000              // 压缩缓冲区 token 数（默认 20000）
  }
}
```

### experimental — 实验性功能

```jsonc
{
  "experimental": {
    "openTelemetry": false,        // 是否启用 OpenTelemetry 追踪
    "continue_loop_on_deny": false, // 权限拒绝后是否继续 Agent Loop
    "eventSystem": false           // 是否启用 v2 事件系统
  }
}
```

### permission — 权限规则

```jsonc
{
  "permission": {
    "rules": [
      { "permission": "tool", "pattern": "read", "action": "allow" },
      { "permission": "tool", "pattern": "grep", "action": "allow" },
      { "permission": "tool", "pattern": "glob", "action": "allow" },
      { "permission": "tool", "pattern": "bash", "action": "ask" },
      { "permission": "tool", "pattern": "write", "action": "ask" },
      { "permission": "tool", "pattern": "edit", "action": "ask" },
      { "permission": "file_write", "pattern": ".env", "action": "deny" }
    ]
  }
}
```

### agents — 自定义 Agent

```jsonc
{
  "agents": {
    "my-custom-agent": {
      "name": "my-custom-agent",
      "description": "A custom agent for specific tasks",
      "mode": "subagent",
      "permission": [
        { "permission": "tool", "pattern": "read", "action": "allow" },
        { "permission": "tool", "pattern": "*", "action": "deny" }
      ],
      "model": { "providerID": "anthropic", "modelID": "claude-haiku-4" },
      "temperature": 0.3,
      "steps": 10
    }
  }
}
```

## A.3 环境变量

| 变量 | 用途 |
|------|------|
| `ANTHROPIC_API_KEY` | Anthropic API Key |
| `OPENAI_API_KEY` | OpenAI API Key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Gemini API Key |
| `OPENCODE_LOG_LEVEL` | 日志级别（DEBUG/INFO/WARN/ERROR） |
| `OPENCODE_AUTO_SHARE` | 是否自动共享会话 |
| `OPENCODE_CONFIG_PATH` | 自定义配置文件路径 |

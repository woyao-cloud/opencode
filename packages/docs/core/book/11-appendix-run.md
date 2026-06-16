# 附录：运行、配置与部署

> 本章包含 Docker Compose 部署示例、完整配置参考、环境变量速查表和代码阅读指南。

---

## 11.1 Docker Compose 部署

### 11.1.1 基础部署：Server + Web UI

```yaml
# docker-compose.yml
# 最小部署：一个 Server 实例 + 一个 Web UI

version: "3.8"

services:
  opencode-server:
    image: opencode/opencode:latest
    container_name: opencode-server
    ports:
      - "8080:8080"                     # HTTP API 端口
    environment:
      # 数据目录
      - XDG_DATA_HOME=/data
      - XDG_CONFIG_HOME=/config
      # 日志级别
      - OPENCODE_LOG_LEVEL=INFO
    volumes:
      - opencode-data:/data             # 持久化数据（DB、日志）
      - opencode-config:/config         # 配置文件
      - ./opencode.json:/config/opencode.json:ro  # 主配置
      - ./projects:/projects:ro          # 项目源代码（只读）
    command: ["opencode", "serve"]

  opencode-web:
    image: opencode/opencode-web:latest
    container_name: opencode-web
    ports:
      - "3000:3000"                     # Web UI 端口
    environment:
      - OPENCODE_SERVER_URL=http://opencode-server:8080
    depends_on:
      - opencode-server

volumes:
  opencode-data:
  opencode-config:
```

### 11.1.2 完整版：Server + Web + Desktop + 反向代理

```yaml
# docker-compose.full.yml
# 完整部署：用 Caddy 做反向代理 + TLS

version: "3.8"

services:
  caddy:
    image: caddy:2
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on:
      - opencode-server
      - opencode-web

  opencode-server:
    image: opencode/opencode:latest
    container_name: opencode-server
    expose:
      - "8080"                         # 只对内暴露
    environment:
      - XDG_DATA_HOME=/data
      - XDG_CONFIG_HOME=/config
      - OPENCODE_LOG_LEVEL=INFO
      # CI/CD 环境注入认证
      - OPENCODE_AUTH_CONTENT=${OPENCODE_AUTH_CONTENT:-}
    volumes:
      - opencode-data:/data
      - opencode-config:/config
      - ./opencode.json:/config/opencode.json:ro
      - ./projects:/projects:ro
    command: ["opencode", "serve"]
    restart: unless-stopped

  opencode-web:
    image: opencode/opencode-web:latest
    container_name: opencode-web
    expose:
      - "3000"                         # 只对内暴露
    environment:
      - OPENCODE_SERVER_URL=http://opencode-server:8080
    depends_on:
      - opencode-server
    restart: unless-stopped

volumes:
  caddy-data:
  opencode-data:
  opencode-config:
```

```caddyfile
# Caddyfile
# 自动 HTTPS + 反向代理

opencode.example.com {
    reverse_proxy /api/* opencode-server:8080
    reverse_proxy /* opencode-web:3000
}
```

### 11.1.3 部署架构图

```
                    ┌─────────────┐
                    │   Caddy     │  端口 80/443 (HTTPS)
                    │ (反向代理)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐  ┌──────────┐  ┌──────────┐
       │ opencode │  │ opencode │  │  用户    │
       │  Server  │  │  Web UI  │  │  浏览器   │
       │ :8080    │  │ :3000    │  │          │
       └──────────┘  └──────────┘  └──────────┘
              │
              ▼
       ┌──────────┐
       │ SQLite   │
       │ (文件 DB) │
       └──────────┘
```

---

## 11.2 opencode.json 配置参考

```jsonc
{
  // ─── AI 提供商配置 ───
  "providers": {
    "anthropic": {
      "enabled": true,
      "models": ["claude-sonnet-4-20250514", "claude-haiku-3-5"]
    },
    "openai": {
      "enabled": true,
      "models": ["gpt-4o", "gpt-4o-mini"]
    }
  },

  // ─── 默认模型 ───
  "model": {
    "provider": "anthropic",
    "name": "claude-sonnet-4-20250514"
  },

  // ─── 插件 ───
  "plugin_origins": [
    { "spec": "npm:@opencode-ai/plugin-copilot" },
    { "spec": "file:///home/user/my-plugin" }
  ],

  // ─── 实验性功能 ───
  "experimental": {
    "openTelemetry": false,
    "continue_loop_on_deny": false
  },

  // ─── MCP 服务器配置 ───
  "mcp_servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/projects"]
    }
  }
}
```

---

## 11.3 环境变量速查表

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `OPENCODE_PURE` | `"1"` | — | 禁用所有外部插件 |
| `OPENCODE_CONFIG_DIR` | 路径 | XDG 默认 | 覆盖配置目录 |
| `OPENCODE_AUTH_CONTENT` | JSON | — | 注入认证数据 |
| `OPENCODE_PLUGIN_META_FILE` | 路径 | 默认 | 覆盖插件元数据路径 |
| `OPENCODE_LOG_LEVEL` | DEBUG/INFO/WARN/ERROR | INFO | 日志级别 |
| `OPENCODE_PID` | 数字 | 自动 | 进程 ID |
| `OPENCODE_RUN_ID` | 字符串 | 自动 | 运行标识（用于日志去重） |
| `XDG_DATA_HOME` | 路径 | `~/.local/share` | 数据目录根路径 |
| `XDG_CONFIG_HOME` | 路径 | `~/.config` | 配置目录根路径 |
| `XDG_CACHE_HOME` | 路径 | `~/.cache` | 缓存目录根路径 |

---

## 11.4 代码阅读指南

### 11.4.1 阅读路径推荐

如果你是第一次阅读 `packages/core/src/`，推荐按以下顺序：

```
1. schema.ts           ← Schema 工具函数（最基础的概念）
2. util/identifier.ts  ← ID 生成（最常用的工具）
3. util/log.ts         ← 日志系统（调试代码时必看）
4. global.ts           ← 路径管理（理解数据存放位置）
5. event.ts            ← 事件总线（核心解耦机制）
6. auth.ts             ← 认证管理（了解凭证存储）
7. filesystem.ts       ← 文件系统（高频使用的方法）
8. aisdk.ts            ← AI SDK 集成（核心业务流程）
9. catalog.ts          ← 模型目录（和 auth 协作）
10. effect/runtime.ts  ← Runtime（高级概念）
```

### 11.4.2 各文件行数速查

| 文件 | 行数 | 复杂度 |
|------|------|--------|
| `schema.ts` | 106 | ★★☆ |
| `event.ts` | 157 | ★★★ |
| `auth.ts` | 264 | ★★★ |
| `catalog.ts` | 269 | ★★★★ |
| `aisdk.ts` | 172 | ★★★ |
| `global.ts` | 86 | ★☆☆ |
| `filesystem.ts` | 244 | ★★☆ |
| `flag/flag.ts` | ~80 | ★☆☆ |
| `effect/runtime.ts` | ~100 | ★★★★ |
| `util/log.ts` | ~200 | ★★☆ |

### 11.4.3 调试提示

```bash
# 1. 启用 DEBUG 级别日志
opencode run --print-logs --log-level DEBUG

# 2. 只运行测试
cd packages/core
bun test

# 3. 类型检查
bun typecheck

# 4. 断点调试
bun --inspect-brk --conditions=browser src/index.ts run
# 然后在 Chrome DevTools 中 attach（chrome://inspect）
```

---

## 11.5 常见问题

### Q: 提示 "Model not found"？
```
1. opencode providers list           ← 检查已配置的提供商
2. opencode debug config             ← 检查配置是否正确
3. opencode providers add <name>     ← 添加提供商凭证
```

### Q: 日志文件在哪里？
```
Linux/macOS: ~/.local/share/opencode/log/
Windows:     C:\Users\<用户>\AppData\Local\opencode\log\
```

### Q: 如何彻底重置？
```bash
rm -rf ~/.local/share/opencode
rm -rf ~/.config/opencode
rm -rf ~/.cache/opencode
```

### Q: 测试数据库在哪里？
默认数据目录下的 `opencode.db`（SQLite 文件）。

---

## 11.6 全书回顾

| 章节 | 核心概念 | Java 对应 |
|------|----------|-----------|
| 第 1 章 | TypeScript 类型系统 | Java 类型系统对比 |
| 第 2 章 | Effect 三部曲 A/E/R | CompletableFuture + try/catch + DI |
| 第 3 章 | Schema 品牌类型 | Jackson + Bean Validation |
| 第 4 章 | EventV2 事件总线 | Spring ApplicationEvent |
| 第 5 章 | AuthV2 凭证管理 | Spring Security |
| 第 6 章 | AISDK AI 集成 | 策略模式 + 工厂模式 |
| 第 7 章 | Catalog 模型目录 | 服务注册/发现 |
| 第 8 章 | 基础设施模块 | java.nio.file + XDG |
| 第 9 章 | Effect 运行时 | Spring ApplicationContext |
| 第 10 章 | 工具函数 | java.util.* |

**核心领悟**：Effect 不是"另一个异步框架"——它是将**错误处理、依赖注入、并发控制、资源管理**统一到一个类型系统中的编程模型。如果你熟悉 Spring 的 DI 和 AOP，理解 Effect 的核心概念只需要一个思维转换：**从"注解驱动"到"函数式组合"**。
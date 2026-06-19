# 附录 C：部署指南

> opencode 的开发环境搭建与生产部署。

---

## C.1 开发环境搭建

### 前置条件

- **Bun** >= 1.0（JavaScript 运行时）
- **Git** >= 2.40
- **Turbo**（monorepo 构建工具，通过 `npm install -g turbo` 安装）

### 克隆与安装

```bash
git clone https://github.com/opencode-ai/opencode.git
cd opencode/packages
bun install
```

### 启动开发模式

```bash
# 启动 CLI 开发模式
bun run dev

# 启动 TUI（终端 UI）开发模式
bun run dev:tui

# 启动 Web 前端开发模式
cd packages/app && bun run dev
```

### 运行测试

```bash
# 运行所有测试
bun test

# 运行特定包的测试
bun test packages/opencode/test/session/

# 运行特定测试文件
bun test packages/opencode/test/tool/read.test.ts
```

### 调试特定 Agent

```bash
# 测试 explore Agent 的工具执行
opencode debug agent explore

# 测试 build Agent 的完整流程
opencode debug agent build --prompt "读取 src/index.ts"
```

## C.2 Docker Compose 部署

```yaml
# docker-compose.yml
version: "3.8"
services:
  opencode-server:
    image: opencode/opencode:latest
    command: ["opencode", "serve"]
    ports:
      - "3000:3000"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - opencode-data:/data
      - ./config.json:/home/opencode/.opencode/config.json

  opencode-web:
    image: opencode/opencode-web:latest
    ports:
      - "8080:8080"
    environment:
      - OPENCODE_SERVER_URL=http://opencode-server:3000

volumes:
  opencode-data:
```

## C.3 生产环境注意事项

1. **API Key 管理** — 使用环境变量或密钥管理服务（如 HashiCorp Vault），不要硬编码在配置文件中
2. **日志级别** — 生产环境建议 `INFO` 或 `WARN`，`DEBUG` 会产生大量输出
3. **OpenTelemetry** — 生产环境建议启用，用于监控 LLM 调用延迟和错误率
4. **资源限制** — 通过 Docker 的 `--memory` 和 `--cpus` 限制容器资源
5. **数据备份** — 定期备份 `~/.opencode/data/` 目录（包含 SQLite 数据库和快照）

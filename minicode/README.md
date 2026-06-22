# minicode

A simplified opencode clone for learning the architecture. Built with Bun + Effect-TS.

## Install

```bash
cd minicode
bun install
bun link        # registers the `minicode` command globally
```

After `bun link`, the `minicode` command is available everywhere via `C:\Users\<you>\.bun\bin\` (Bun's global bin directory). Verify:

```bash
minicode --help
minicode --version    # 0.0.1
```

## Usage

### Single prompt

```bash
# after bun install + bun link:
minicode run -p "hello"

# or without linking:
bun run packages/opencode/src/index.ts run -p "hello"
```

### Interactive REPL

```bash
minicode run -i
```

### HTTP Server

```bash
minicode serve --port 4096
# POST /session    { "directory": "/path" }  -> create session
# GET  /session                              -> list sessions
```

### With OpenAI-compatible (Ollama etc.)

```bash
minicode run -p "hello" --base-url http://localhost:11434/v1 --model llama3
minicode run -p "规划一个贪吃蛇游戏" --base-url http://localhost:11434/v1 --model llama3
```

set MINICODE_LOG_PRINT=1
set MINICODE_LOG_LEVEL=DEBUG 
# work well
运行单会话
```
set MINICODE_MODEL=glm-5.1:cloud
set OPENAI_API_KEY=97c5090d09d7450086d97d017651de77.yJv_ANaLOWh217NSxJN_iUbU
minicode run -p "hello" --base-url https://ollama.com/v1
minicode run -p "规划一个贪吃蛇游戏" --base-url https://ollama.com/v1
```
运行多会话 REPL mode
minicode run -i --base-url https://ollama.com/v1
# work well

## Using Ollama as the LLM backend

minicode supports any OpenAI-compatible API, including [Ollama](https://ollama.ai) for local model inference. Below is a step-by-step guide.

### Step 1 — Install Ollama

Download and install from <https://ollama.ai> (macOS / Linux / Windows). After installation, the Ollama daemon starts automatically and listens on `http://localhost:11434`.

Verify it is running:

```bash
ollama --version
curl http://localhost:11434/api/tags
```

### Step 2 — Pull a model

Ollama needs a model downloaded locally before it can serve requests. A few good options:

```bash
# Lightweight, fast — good for testing
ollama pull qwen2.5:0.5b

# General-purpose, recommended for coding tasks
ollama pull qwen2.5-coder:7b

# Larger model, better quality (requires ~8GB VRAM)
ollama pull llama3:8b
```

Check installed models:

```bash
ollama list
```

### Step 3 — Run minicode against Ollama

Ollama exposes an OpenAI-compatible endpoint at `http://localhost:11434/v1`. minicode connects to it via `--base-url`:

```bash
# Single prompt
bun run packages/opencode/src/index.ts run \
  -p "Write a hello world in Python" \
  --base-url http://localhost:11434/v1 \
  --model qwen2.5-coder:7b

MINICODE_LOG_PRINT=1 MINICODE_LOG_LEVEL=DEBUG 
bun run packages/opencode/src/index.ts run   -p "Write a hello world in Python"   --base-url http://localhost:11434/v1   --model qwen2.5-coder:7b

# Interactive REPL
bun run packages/opencode/src/index.ts run \
  -i \
  --base-url http://localhost:11434/v1 \
  --model qwen2.5-coder:7b
```

> **Tip:** Ollama does not require an API key, but minicode still sends one in the request header. You can pass any non-empty string via `--api-key`, or simply ignore it — Ollama ignores the `Authorization` header.
>
> ```bash
> --api-key ollama
> ```

### Step 4 — (Optional) Configure via minicode.json

Instead of passing `--base-url` and `--model` on every invocation, you can persist the configuration in a `minicode.json` placed in your project root:

```json
{
  "agents": [
    {
      "name": "build",
      "description": "Default agent backed by Ollama",
      "prompt": "You are a helpful coding assistant.",
      "model": {
        "providerID": "openai-compatible",
        "modelID": "qwen2.5-coder:7b"
      }
    }
  ],
  "providers": [
    {
      "id": "ollama",
      "name": "Ollama Local",
      "baseURL": "http://localhost:11434/v1"
    }
  ],
  "permission": { "*": "allow" }
}
```

Then run without flags:

```bash
minicode run -p "hello"
```

### Step 5 — Verify the connection

If something goes wrong, enable logging to stderr for diagnostics:

```bash
MINICODE_LOG_PRINT=1 MINICODE_LOG_LEVEL=DEBUG \
  bun run packages/opencode/src/index.ts run \
  -p "hello" \
  --base-url http://localhost:11434/v1 \
  --model qwen2.5-coder:7b
```

Common issues:

| Symptom | Cause | Fix |
|---|---|---|
| `fetch failed` / `ECONNREFUSED` | Ollama daemon not running | `ollama serve` or restart Ollama app |
| `model not found` | Model not pulled | `ollama pull <model>` |
| Empty or garbled response | Model too small for the prompt | Use a larger model (7b+) |
| Timeout on first call | First inference loads model into memory | Wait a few seconds and retry |

## Architecture

```
packages/
├── core/      # @minicode/core    — global paths, schema, logging, errors
├── llm/       # @minicode/llm     — Provider/Tool abstraction, ai-sdk wrapper
└── opencode/  # @minicode/opencode — main program (17 submodules)
    ├── agent/       # Agent definition + default "build" agent
    ├── bus/         # Event bus (PubSub)
    ├── cli/         # CLI entry (yargs: run, serve)
    ├── command/     # Command templates (skeleton)
    ├── config/      # Config loading (minicode.json)
    ├── effect/      # Effect runtime utils (InstanceState, makeRuntime, bridge)
    ├── env/         # Environment variables
    ├── file/        # File operations (read/write/glob)
    ├── git/         # Git operations (branch/status/diff)
    ├── permission/  # Permission rules (allow/ask/deny)
    ├── plugin/      # Plugin loader (skeleton)
    ├── project/     # Project instance + bootstrap
    ├── server/     # HTTP server
    ├── session/     # Session management (SQLite + Drizzle)
    ├── skill/       # Skill discovery (skeleton)
    ├── tool/        # Tool registry + read/write/bash
    └── worktree/    # Git worktree operations
```

## Config

Place `minicode.json` in your project directory:

```json
{
  "agents": [
    {
      "name": "build",
      "description": "Default agent",
      "prompt": "You are a helpful assistant.",
      "model": { "providerID": "openai", "modelID": "gpt-4o-mini" }
    }
  ],
  "providers": [],
  "permission": { "*": "allow" }
}
```

## Logs

Logs go to `~/.minicode/log/` by default. Set `MINICODE_LOG_PRINT=1` to print to stderr.

## Dependencies

- `effect` — Effect-TS runtime
- `ai` + `@ai-sdk/openai` — LLM SDK
- `drizzle-orm` — SQLite ORM
- `yargs` — CLI
- `bun:sqlite` — SQLite (Bun built-in)



minicode run -prompt "用 Python 写一个贪吃蛇"   --base-url https://ark.cn-beijing.volces.com/api/v3   --model doubao-1.5-pro-256k   --ark-c5e2fa41-9de3-4496-85f8-68fc94fb8fff-ace69

火山引擎方舟 ARK API 是 OpenAI 兼容的，所以用 openai-compatible provider 就可以了。
方式一：命令行参数（快速测试）
minicode run -p "用 Python 写一个贪吃蛇" \
  --base-url https://ark.cn-beijing.volces.com/api/v3 \
  --model doubao-1.5-pro-256k \
  --api-key <你的ARK_API_KEY>
参数说明：
- --base-url — 火山方舟的 API 端点，固定为 https://ark.cn-beijing.volces.com/api/coding
- --model — 你接入的模型 ID（在火山方舟控制台 → "推理接入" 中可以查到，比如 doubao-1.5-pro-256k）
- --api-key — 你的 API Key（火山方舟控制台 → "API Key 管理"）
方式二：minicode.json 配置文件
在项目目录下创建 minicode.json：
{
  agents: [
    {
      name: build,
      description: 火山引擎豆包模型,
      prompt: You are a helpful coding assistant.,
      model: {
        providerID: openai-compatible,
        modelID: doubao-1.5-pro-256k
      }
    }
  ],
  providers: [
    {
      id: volc,
      name: 火山引擎方舟,
      baseURL: https://ark.cn-beijing.volces.com/api/v3,
      apiKey: <你的ARK_API_KEY>
    }
  ],
  permission: { *: allow }
}
配置好后直接运行（不需要每次传参数）：
minicode run -p "用 Python 写一个贪吃蛇"
方式三：环境变量
set MINICODE_MODEL=doubao-1.5-pro-256k
set OPENAI_API_KEY=<你的ARK_API_KEY>
minicode run -p "你好" --base-url https://ark.cn-beijing.volces.com/api/coding


MINICODE_MODEL=doubao-1.5-pro-256k
OPENAI_API_KEY=ark-c5e2fa41-9de3-4496-85f8-68fc94fb8fff-ace69
minicode run -p "你好" --base-url https://ark.cn-beijing.volces.com/api/coding
---
注意：火山方舟的模型 ID 不是通用名称，需要去控制台 (https://console.volcengine.com/ark) → "推理接入" → 查看你创建的接入点的"模型 ID"（类似 doubao-1.5-pro-256k 或 ep-2025xxxx-xxxxx 的格式）。API Key 也在控制台的 "API Key 管理" 中生成。
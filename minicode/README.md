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
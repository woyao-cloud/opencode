# minicode

A simplified opencode clone for learning the architecture. Built with Bun + Effect-TS.

## Install

```bash
cd minicode
bun install
```

## Usage

### Single prompt

```bash
bun run packages/opencode/src/index.ts run -p "hello"
# or after install:
minicode run -p "hello"
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
```

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
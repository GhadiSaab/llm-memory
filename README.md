# llm-memory

Persistent memory for LLM coding agents — Claude Code, Codex, Gemini CLI, OpenCode.

When you start a new session, the agent already knows what you worked on last time: decisions made, files touched, errors hit, conventions learned. No cloud. No telemetry. Everything lives in a local SQLite database at `~/.llm-memory/store.db`.

## How it works

```
Session starts
      │
 Shell wrapper intercepts 'claude' (or codex/gemini/opencode)
      │
 MCP server starts alongside — injects prior context, exposes memory tools
      │
 During session: hooks fire on every tool call, messages buffered
      │
 Session ends (clean exit / Ctrl-C / crash)
      │
 Layer 1 → Layer 2 → Layer 3 pipeline runs
      │
      ├── Layer 1: extract weighted messages, events, decisions, errors, keywords
      ├── Layer 2: compress to ≤500-token digest, store in DB
      └── Layer 3: merge digest into project memory doc (markdown)

Next session: agent reads prior context automatically
```

## Install

```bash
npm install -g llm-memory
llm-memory setup
```

The setup wizard:
1. Detects which tools are installed (`claude`, `codex`, `gemini`, `opencode`)
2. Asks which ones to integrate
3. Writes hook configs for each tool
4. Creates wrapper symlinks in `~/.llm-memory/bin/`
5. Adds `~/.llm-memory/bin` to your PATH via `~/.bashrc` / `~/.zshrc`

Restart your shell (or `source ~/.bashrc`), then use your tools as normal — memory is automatic.

## Commands

```bash
llm-memory setup                        # interactive setup wizard
llm-memory status                       # show configuration and stats
llm-memory projects list                # list all projects
llm-memory projects show <name>         # print full memory doc for a project
llm-memory projects forget <name>       # reset memory (keeps sessions)
llm-memory projects forget <name> --hard  # delete all sessions + data
```

## MCP server

The MCP server runs as a sidecar alongside each tool session and exposes five tools:

| Tool | Description |
|---|---|
| `store_message` | Buffer a conversation message for processing at session end |
| `store_event` | Record a tool call event (file edit, bash command, etc.) |
| `search_context` | Search past sessions by semantic similarity or keywords |
| `get_project_memory` | Return the full project memory doc |
| `list_sessions` | List recent sessions with goals and outcomes |

To use the MCP server standalone with Claude Code, add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "llm-memory": {
      "command": "node",
      "args": ["/path/to/llm-memory/dist/src/mcp/index.js"]
    }
  }
}
```

## Architecture

```
src/
  cli/        — setup wizard, status, projects commands
  db/         — SQLite schema + CRUD (projects, sessions, events, digests, memory)
  layer1/     — pure message/event processing → weighted Layer1Output
  layer2/     — digest compression to ≤500 tokens → Layer2Digest
  layer3/     — merge digest into ProjectMemory markdown
  mcp/        — MCP server (handlers + stdio entry point)
  wrapper/    — shell wrapper (intercepts tool invocation, manages session lifecycle)
  hooks/      — hook config writers for Claude / Gemini / OpenCode
```

**Key constraints:**
- All Layer 1/2/3 functions are pure — no I/O, never throw
- Digests stay under 500 tokens
- Vector search uses all-MiniLM-L6-v2 embeddings via `sqlite-vec` (384-dim)
- Single SQLite DB, WAL mode, foreign keys on

## Development

```bash
npm run build       # tsc → dist/
npm run dev         # tsc --watch
npm run test:run    # vitest (single-shot, 456 tests)
npm test            # vitest (watch mode)
```

DB path defaults to `~/.llm-memory/store.db`. Override with `LLM_MEMORY_DB_PATH`.

## License

MIT

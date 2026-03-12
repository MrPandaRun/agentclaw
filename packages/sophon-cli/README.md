# Sophon CLI

First-party local orchestration CLI for AgentDock, now backed by `@mariozechner/pi-coding-agent` from `pi-mono`.

## Status

This package is the current MVP implementation of `sophon`.

Implemented now:

- pi-backed session persistence under `~/.sophon/sessions`
- isolated pi runtime/config under `~/.sophon/agent`
- workspace conductor sessions under `~/.sophon/workspace`
- skills discovery from `~/.sophon/skills` via pi resource loading
- stable JSON commands used by the desktop app
- pass-through support for pi-coding-agent flags and modes

Not complete yet:

- full autonomous worker execution across other agent CLIs
- release-manifest based binary distribution

## Development

Run directly with Bun:

```bash
bun packages/sophon-cli/src/index.ts
bun packages/sophon-cli/src/index.ts health --json
```

Workspace scripts:

```bash
bun run --filter @agentdock/sophon-cli typecheck
bun run --filter @agentdock/sophon-cli test
```

## Local Paths

Default layout:

```text
~/.sophon/
  config.json
  settings.json
  agent/
  sessions/
  threads/
  runtime/
  skills/
  workspace/
    sessions/
```

Useful environment variables:

- `SOPHON_HOME`
- `AGENTDOCK_SOPHON_BIN`
- `PI_CODING_AGENT_DIR` is managed internally by `sophon` and points at `~/.sophon/agent`

## Commands

```bash
sophon --version
sophon health --json
sophon threads list --json [--project-path <path>]
sophon threads runtime --thread-id <id> --json
sophon threads resume <thread_id> [--json]
sophon skills list --json
sophon config get --json
sophon config set --provider <provider> --model <model> [--thinking-level <level>] [--json]
sophon conductor sessions list --json
sophon conductor sessions start --workspace <path> --json
sophon conductor sessions inspect --session-id <id> --json
sophon conductor sessions resume <session_id>
```

Any other pi-coding-agent CLI flags are forwarded through Sophon with Sophon-specific `agentDir` and session storage defaults.

Model defaults are persisted in `~/.sophon/agent/settings.json`, for example:

```bash
sophon config set --provider zai --model glm-4.7 --thinking-level medium --json
```

## Related Docs

- [`../../docs/sophon.md`](../../docs/sophon.md)
- [`../../README.md`](../../README.md)

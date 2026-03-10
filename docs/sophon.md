# Sophon

> Updated: 2026-03-10  
> Status: implementation-aligned MVP

## Overview

`Sophon` is the first-party agent in this repository.

It has two roles:

- As an agent provider, it appears beside `codex`, `claude_code`, and `opencode`.
- As a conductor, it coordinates work inside `~/.sophon/workspace`.

Runtime-wise, `sophon` is now implemented on top of `pi-mono`'s `@mariozechner/pi-coding-agent`.
Sophon keeps its own CLI name, directory layout, JSON contracts, and conductor metadata, while delegating the actual coding-agent runtime to pi.

`conductor` is an internal role term. The public name stays `sophon` across the CLI, provider ID, install flow, config paths, and desktop UI.

## Directory Layout

Default local paths:

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

Current meaning:

- `~/.sophon/agent/` stores the isolated pi runtime config used by `sophon` (`settings.json`, auth, global prompt files, package resources).
- `~/.sophon/sessions/` stores pi JSONL session files for Sophon threads.
- `~/.sophon/threads/` stores Sophon sidecar metadata for pi sessions.
- `~/.sophon/runtime/` stores lightweight runtime state used by desktop polling.
- `~/.sophon/` root still stores Sophon-specific config and local skill mirrors.
- `~/.sophon/workspace/` is the automatic-mode workspace root.
- `~/.sophon/workspace/sessions/` stores conductor session records.

Override knobs:

- `SOPHON_HOME`: override the Sophon root directory.
- `AGENTDOCK_SOPHON_BIN`: override the Sophon executable path used by desktop and the Rust adapter.

## Desktop Modes

AgentClaw desktop has two global modes:

### Manual Mode

- Left side shows the original folder-grouped thread list.
- Right side remains the integrated terminal.
- Creating a Sophon thread here starts a normal Sophon session in the selected project path.

### Automatic Mode

- Left side switches to Sophon threads under `~/.sophon/workspace`.
- Right side remains the integrated terminal.
- Creating a thread here starts or resumes a Sophon workspace session and attaches it to a conductor session.

## Managed Install

During desktop development, the Tauri host can build a managed Sophon binary from:

- `packages/sophon-cli/src/index.ts`

The managed binary is stored under the app data directory and then exported through `AGENTDOCK_SOPHON_BIN`.

Terminal launch behavior must follow this rule:

- If `AGENTDOCK_SOPHON_BIN` is set, use that absolute binary path.
- Otherwise, fall back to `sophon` from `PATH`.

This avoids `command not found` failures after AgentClaw installs Sophon for the current app instance.

## CLI Surface

Current implemented CLI commands:

```bash
sophon
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

Other `pi-coding-agent` flags are forwarded through `sophon`.
In practice this means `sophon -p ...`, `sophon --model ...`, `sophon --continue`, `sophon --resume`, `sophon --mode json`, and similar pi-compatible flows now run against Sophon's own `agentDir` and session store.

Persistent model defaults live in `~/.sophon/agent/settings.json`. You can write them through the CLI:

```bash
sophon config set --provider zai --model glm-4.7 --thinking-level medium --json
```

## Skills

Sophon discovers local skills from:

- `~/.sophon/skills/*/SKILL.md`

Those skills are exposed to the pi runtime through Sophon's isolated agent settings, so skill loading now follows pi's resource system while keeping Sophon's public directory layout.

## Provider Integration

Desktop and Rust host integration depend on the stable JSON output of the Sophon CLI.

Current adapter crate:

- `crates/provider-sophon`

Current desktop host touchpoints:

- `apps/desktop/src-tauri/src/sophon_install.rs`
- `apps/desktop/src-tauri/src/terminal.rs`
- `apps/desktop/src-tauri/src/commands.rs`
- `apps/desktop/src-tauri/src/threads.rs`

## Current Scope

Implemented now:

- pi-backed Sophon thread runtime and session storage
- workspace conductor session storage
- stable JSON command surface for desktop integration
- managed binary install for desktop development
- manual/automatic desktop mode switch
- linked thread references and worker-agent metadata sidecars

Not complete yet:

- full autonomous worker execution engine across other agent CLIs
- robust task scheduling, retries, and long-running orchestration lifecycle
- published binary manifest download flow for desktop installs

Use this document as the source of truth for current Sophon behavior in this repository.

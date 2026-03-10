# AgentDock Current Product Summary (Implementation-Aligned)

> Updated: 2026-03-10  
> Based on code in: `apps/desktop`, `apps/desktop/src-tauri`, `crates/*`, `packages/contracts`

## 1. Product Positioning

AgentDock is a local-first multi-agent control console for CLI-based coding workflows.

Supported agents:
- `codex`
- `claude_code`
- `opencode`
- `sophon`

Core boundary:
- AgentDock does not replace agent-native thread engines.
- Thread execution and continuation still happen through agent CLIs.

## 1.1 Canonical Terminology (UI/Product)

- Project: folder-level grouping in the left sidebar.
- Thread: one interaction unit shown in UI.
- Agent: primary execution carrier (`codex` / `claude_code` / `opencode` / `sophon`).
- Model Provider: model vendor used by an agent run (for example OpenAI, Anthropic, OpenRouter).
- Conductor: internal Sophon role for orchestrating work inside `~/.sophon/workspace`.

## 2. Current User Value

- Unified historical thread visibility from four agents.
- Folder-grouped navigation in manual mode and Sophon workspace navigation in automatic mode.
- Embedded terminal continuation for selected threads.
- New thread launch entry via global/folder create flow with Agent selection.
- First-party Sophon workspace sessions for local coordination metadata.

## 3. Capability Inventory

### 3.1 Shared Contract Layer

- TS: `packages/contracts/src/provider.ts`
- Rust: `crates/provider-contract/src/lib.rs`

Aligned provider IDs:
- `codex`
- `claude_code`
- `opencode`
- `sophon`

Current shared adapter method surface:
- `health_check`
- `list_threads`
- `resume_thread`

### 3.2 Adapter Implementations

- `provider-codex`
  - Reads from `~/.codex/sessions`
  - Uses official title map from `~/.codex/.codex-global-state.json`
  - Resume command path: `codex resume <thread_id>`
- `provider-claude`
  - Reads from `~/.claude/projects`
  - Uses official history display title from `~/.claude/history.jsonl`
  - Resume command path: `claude --resume <thread_id>`
- `provider-opencode`
  - Reads from `~/.local/share/opencode/storage`
  - Prefers session `title`
  - Resume command path: `opencode --session <thread_id>`
- `provider-sophon`
  - Reads through the `sophon` CLI JSON interface instead of parsing private files directly
  - Health command path: `sophon health --json`
  - Thread list command path: `sophon threads list --json`
  - Resume command path: `sophon threads resume <thread_id>`
  - Workspace conductor session path: `sophon conductor sessions list --json`

All four adapters expose runtime-state reading used by desktop terminal lifecycle decisions.

### 3.3 Desktop UI and Title/Preview Rules

- Global workspace mode switch:
  - Manual mode: folder-grouped thread list on the left
  - Automatic mode: Sophon workspace thread list on the left
- Right panel: embedded terminal (terminal-only mode).

Thread text behavior:
- Backend returns `title` + optional `lastMessagePreview`.
- Sidebar item text (`threadPreview`) uses `title` first.
- If `title` is empty, sidebar falls back to `lastMessagePreview`.
- Header title uses selected thread `title`.
- Create Thread dialog displays per-agent install status (`installed` + `health_status`) before launch.
- If a selected agent CLI is missing, Create is blocked and install guidance is shown.
- If Sophon is missing, desktop can install a managed Sophon binary and then launch new/resumed Sophon sessions through that absolute path.
- Settings provide active `Agent` plus per-agent supplier management (official + third-party), persisted in desktop local storage.
- Each supplier supports profile, API base/key fields, and optional config JSON (`env`) overrides.
- Embedded terminal launch requests carry `profile_name` and supplier env values, injecting them into CLI command context.

Consistency intent:
- Agent adapters should produce stable, agent-official `title` whenever available.
- Sidebar/header should converge on the same canonical title for normal threads.

### 3.4 Tauri Host Command Surface

From `apps/desktop/src-tauri/src/commands.rs`:
- `list_threads`
- `list_provider_install_statuses`
- `get_sophon_workspace_path`
- `install_sophon_cli`
- `list_sophon_conductor_sessions`
- `start_sophon_conductor_session`
- `get_claude_thread_runtime_state`
- `get_codex_thread_runtime_state`
- `get_opencode_thread_runtime_state`
- `get_sophon_thread_runtime_state`
- `open_thread_in_terminal`
- `open_new_thread_in_terminal`
- `start_embedded_terminal`
- `start_new_embedded_terminal`
- `write_embedded_terminal_input`
- `resize_embedded_terminal`
- `close_embedded_terminal`

## 4. Data Layer

`agentdock-core` initializes SQLite and runs append-only migrations on startup.

Current baseline tables include:
- `providers`
- `accounts`
- `configs`
- `mcps`
- `skills`
- `threads`
- `thread_messages`
- `switch_events`
- `remote_devices`
- `remote_sessions`

Note:
- `accounts` remains an internal table name; user-facing terminology should use `Agent` / `Model Provider`.

## 5. Stage Assessment

### Completed

- Four-agent contract alignment (TS/Rust)
- Four-agent thread scanning + resume command path
- Desktop terminal-first continuation flow
- Manual/automatic desktop workspace mode switch
- Sophon CLI MVP with local session and conductor workspace state
- Local DB initialization + migration baseline

### In Progress

- Desktop interaction refinement (window drag/layout details)
- Productized Sophon-led cross-agent orchestration strategy

### Not Complete Yet

- End-to-end mobile remote control loop
- Collaboration/cloud capabilities
- Governance/billing systems

## 6. Key Constraints

- Desktop execution flow is terminal-only.
- Sophon currently tracks workspace coordination state and linked threads, but does not yet execute a full autonomous worker scheduling loop across all providers.
- No in-app message composer/list send flow in current desktop build.

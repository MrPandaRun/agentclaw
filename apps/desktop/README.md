# AgentDock Desktop

Desktop runtime for AgentDock, built with Tauri (Rust host) + React/Vite (UI).

Current desktop execution model is terminal-only (embedded PTY + terminal launch).

For product overview, provider scope, and contribution guidelines:

- Root README (EN): [`../../README.md`](../../README.md)
- Root README (中文): [`../../README.zh-CN.md`](../../README.zh-CN.md)

## Local Development

Run from the repository root:

```bash
bun run dev:desktop
```

Or run package-scoped commands:

```bash
bun run --filter @agentdock/desktop dev
bun run --filter @agentdock/desktop typecheck
bun run --filter @agentdock/desktop test
```

## Workspace Modes

- Manual mode preserves the original UI model: folder-grouped threads on the left and the integrated terminal on the right.
- Automatic mode switches the left side to Sophon workspace threads under `~/.sophon/workspace` and still uses the integrated terminal on the right.
- Sophon is a first-party agent in desktop, but its conductor role is surfaced through workspace mode rather than a separate standalone view.

## Sophon Integration

- The Tauri host can install a managed Sophon binary from `packages/sophon-cli` during development.
- Sophon-specific host commands cover workspace path discovery, managed installation, conductor session listing/creation, and runtime-state polling.
- New or resumed Sophon threads should launch through the managed binary path when `AGENTDOCK_SOPHON_BIN` is set, instead of assuming `sophon` already exists in `PATH`.

## Key Paths

- UI source: `src/`
- Tauri host: `src-tauri/`
- Package config: `package.json`

## Related Docs

- Root product overview: [`../../README.md`](../../README.md)
- Sophon CLI and workspace behavior: [`../../docs/sophon.md`](../../docs/sophon.md)

## Notes

- JavaScript workspace operations use Bun.
- Tauri platform dependencies must be installed for your OS.

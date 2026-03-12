# AgentClaw

面向 `codex`、`claude_code`、`opencode`、`sophon` 的本地优先（local-first）编码代理控制平面。

[English](./README.md) | [简体中文](./README.zh-CN.md)

AgentClaw 帮助你在同一个桌面工作台中查看并恢复 Agent 原生线程，不替代上游 CLI。`Sophon` 是仓库内实现的第一方 Agent，可独立作为 CLI 运行，也可在桌面端自动模式下承担编排角色。

## Why AgentClaw

- 把多 Agent 编码工作流收敛到一个入口，减少在不同 CLI 历史之间来回切换。
- 以 Agent 原生线程数据为事实来源，同时维护本地统一索引。
- 保持 TS/Rust 契约语义对齐，确保桌面端、移动端和适配器行为一致。
- 默认本地优先：运行时、SQLite 状态和 CLI 集成都在本机。

## 术语统一（Canonical）

- Project / 项目：左侧栏按文件夹维度的一级分组。
- Thread / 线程：UI 中展示的一次交互单元。
- Agent / 代理：主要执行载体（`codex` / `claude_code` / `opencode` / `sophon`）。
- Model Provider / 模型提供者：Agent 运行时使用的模型服务方（如 OpenAI、Anthropic、OpenRouter）。
- Conductor：Sophon 在 `~/.sophon/workspace` 中协调其他 Agent 时使用的内部角色术语。

## Feature Snapshot

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| Agent 范围（`codex`、`claude_code`、`opencode`、`sophon`） | Now | TS 与 Rust 契约已对齐（在契约中表现为 Provider ID）。 |
| 本地优先桌面运行时（Tauri + React） | Now | Rust host + React/Vite UI。 |
| 统一线程列表 + 恢复 | Now | 四个适配器已接入线程扫描和恢复命令路径。 |
| 桌面执行模式 | Now | terminal-only（内嵌 PTY + 外部终端启动）。 |
| 全局工作模式切换 | Now | 手动模式保留按文件夹聚合线程；自动模式聚焦 Sophon workspace 线程。 |
| Sophon 第一方 CLI | MVP | 已实现本地会话存储、skills 发现、workspace conductor session 和稳定 JSON 命令。 |
| 自动化跨 Agent worker 执行 | In Progress | Sophon 当前已维护编排状态和关联线程；完整 worker 执行调度尚未完成。 |
| 移动端远程控制流程 | Planned | Expo 壳层已存在，完整闭环尚未完成。 |

## 当前桌面行为

- 全局模式切换：
  - 手动模式保留原始左侧按文件夹聚合线程，右侧为集成终端。
  - 自动模式将左侧切换为 `~/.sophon/workspace` 下的 Sophon 线程，右侧仍然是集成终端。
- 手动模式下，左侧按项目文件夹分组展示线程。
- 线程数据包含 `title` 和可选的 `lastMessagePreview`。
- 左侧条目文本优先使用 `title`；为空时回退到 `lastMessagePreview`。
- Header 标题使用当前选中线程的 `title`。
- 新建 Thread 弹窗会检查各 Agent CLI 的安装状态，未安装时提供安装引导。
- 若缺少 Sophon，桌面端可安装托管 Sophon 二进制，并在新建/恢复线程时优先使用该绝对路径。
- 设置中可按 Agent 切换供应商（官方 default + 第三方），并为每个供应商配置 Profile 与可选 Config JSON/env；选择会本地持久化并应用到终端会话启动。
- 适配器标题策略优先 Agent 官方标题，其次回退到用户输入。

## Quick Start

在仓库根目录执行：

```bash
bun install
bun run dev:desktop
```

可选：

```bash
bun run dev:mobile
bun run dev
```

## Prerequisites

- Bun `1.1.27+`
- Rust stable toolchain（见 `rust-toolchain.toml`）
- Tauri v2 与 Expo 所需平台依赖
- 以下 Agent CLI 在 `PATH` 可用：
  - `codex`
  - `claude`（对应 `claude_code`）
  - `opencode`
- 开发态下，Sophon 可通过 Bun 从 `packages/sophon-cli` 构建为托管二进制。若桌面安装成功，则不要求系统里预先存在全局 `sophon` 命令。

可选环境变量覆盖：

| 变量 | 作用 |
| --- | --- |
| `AGENTDOCK_CODEX_HOME_DIR` | 覆盖 Codex 会话目录根路径。 |
| `AGENTDOCK_CLAUDE_CONFIG_DIR` | 覆盖 Claude 配置目录根路径。 |
| `AGENTDOCK_CLAUDE_BIN` | 覆盖 Claude CLI 二进制名称/路径。 |
| `AGENTDOCK_OPENCODE_DATA_DIR` | 覆盖 OpenCode 数据目录根路径。 |
| `AGENTDOCK_OPENCODE_BIN` | 覆盖 OpenCode CLI 二进制名称/路径。 |
| `AGENTDOCK_SOPHON_BIN` | 覆盖桌面端与 Rust 适配器使用的 Sophon CLI 二进制名称/路径。 |
| `SOPHON_HOME` | 覆盖 Sophon 根目录（默认：`~/.sophon`）。 |

## Development Commands

| 命令 | 用途 |
| --- | --- |
| `bun run dev:desktop` | 启动 Tauri 桌面应用。 |
| `bun run dev:mobile` | 启动 Expo 移动端开发服务。 |
| `bun run dev` | 仅启动桌面 Web UI（Vite）。 |
| `bun run build` | 执行定义了 build 的工作区构建脚本。 |
| `bun run lint` | 执行工作区 lint 检查。 |
| `bun run typecheck` | 执行 TS 检查 + `cargo check --workspace`。 |
| `bun run test` | 执行工作区测试 + `cargo test --workspace`。 |

定向示例：

```bash
bun run --filter @agentdock/contracts test
bun run --filter @agentdock/desktop typecheck
cargo test -p provider-codex -- list_threads_reads_codex_sessions
```

## 契约说明

Provider ID 固定为：

```ts
type ProviderId = "codex" | "claude_code" | "opencode" | "sophon";
```

共享契约文件：
- TS：`packages/contracts/src/provider.ts`
- Rust：`crates/provider-contract/src/lib.rs`

`ProviderAdapter` 当前方法：
- `health_check`
- `list_threads`
- `resume_thread`

桌面端依赖的 Sophon CLI 稳定命令包括：
- `sophon health --json`
- `sophon threads list --json`
- `sophon threads runtime --thread-id <id> --json`
- `sophon conductor sessions list --json`

## 文档索引

- 当前实现摘要：[`docs/agentdock-current-product-summary.md`](./docs/agentdock-current-product-summary.md)
- Sophon Agent 与工作模式：[`docs/sophon.md`](./docs/sophon.md)
- 当前 Phase 1 执行规范：[`docs/agentdock-phase1-prd.md`](./docs/agentdock-phase1-prd.md)
- 带勘误的历史规划文档：
  - [`Project-AgentDock.md`](./Project-AgentDock.md)
  - [`PRD-AgentDock-v1.md`](./PRD-AgentDock-v1.md)
  - [`Architecture-AgentDock-v1.md`](./Architecture-AgentDock-v1.md)

## Contributing

1. 创建分支。
2. 实现改动并补测试。
3. 运行：

```bash
bun run typecheck
bun run test
```

4. 使用 Conventional Commits。
5. PR 需包含变更内容、原因、命令/测试与必要截图。

## License

MIT，见 [`LICENSE`](./LICENSE)。

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  buildLaunchAppendSystemPrompt,
  buildPiForwardArgs,
  createConductorSession,
} from "./index";

describe("createConductorSession", () => {
  test("normalizes worker agents and preserves workspace path", () => {
    const session = createConductorSession("/tmp/workspace", [
      "codex",
      "codex",
      "claude_code",
    ]);

    expect(session.workspacePath).toBe("/tmp/workspace");
    expect(session.workerAgents).toEqual(["codex", "claude_code"]);
    expect(session.status).toBe("idle");
  });
});

describe("buildLaunchAppendSystemPrompt", () => {
  test("includes thread and conductor context", () => {
    const prompt = buildLaunchAppendSystemPrompt(
      {
        config: {
          agentName: "sophon",
          defaultMode: "automatic",
          defaultWorkerAgents: ["codex", "claude_code"],
          skillDirectories: [],
        },
      },
      "thread-42",
      {
        id: "conductor-1",
        workspacePath: "/tmp/.sophon/workspace",
        workerAgents: ["codex", "opencode"],
        linkedThreadKeys: ["codex:abc"],
        notes: ["Review failing tests first"],
      },
    );

    expect(prompt).toContain("Sophon thread id: thread-42");
    expect(prompt).toContain("Sophon conductor session: conductor-1");
    expect(prompt).toContain("Linked threads: codex:abc");
    expect(prompt).toContain("Review failing tests first");
  });
});

describe("buildPiForwardArgs", () => {
  test("injects sophon session dir, session file, and conductor prompt", () => {
    const args = buildPiForwardArgs(
      {
        config: {
          agentName: "sophon",
          defaultMode: "automatic",
          defaultWorkerAgents: ["codex", "claude_code"],
          skillDirectories: [],
        },
        paths: {
          sophonHome: "/tmp/.sophon",
          sessionsDir: "/tmp/.sophon/sessions",
          threadMetadataDir: "/tmp/.sophon/threads",
          runtimeDir: "/tmp/.sophon/runtime",
          workspaceRoot: "/tmp/.sophon/workspace",
          workspaceSessionsDir: "/tmp/.sophon/workspace/sessions",
          skillsDir: "/tmp/.sophon/skills",
          agentDir: "/tmp/.sophon/agent",
          agentExtensionsDir: "/tmp/.sophon/agent/extensions",
          agentSettingsPath: "/tmp/.sophon/agent/settings.json",
          agentAppendSystemPromptPath: "/tmp/.sophon/agent/APPEND_SYSTEM.md",
          agentHeaderExtensionPath: "/tmp/.sophon/agent/extensions/sophon-header.ts",
          configPath: "/tmp/.sophon/config.json",
          settingsPath: "/tmp/.sophon/settings.json",
        },
      },
      ["--model", "openai/gpt-5"],
      {
        threadId: "thread-1",
        sessionFile: "/tmp/.sophon/sessions/thread-1.jsonl",
        projectPath: "/tmp/project",
      },
      {
        id: "conductor-1",
        workspacePath: "/tmp/.sophon/workspace",
        workerAgents: ["codex"],
        linkedThreadKeys: [],
        notes: [],
      },
    );

    expect(args).toEqual(
      expect.arrayContaining([
        "--extension",
        "/tmp/.sophon/agent/extensions/sophon-header.ts",
        "--session-dir",
        "/tmp/.sophon/sessions",
        "--session",
        "/tmp/.sophon/sessions/thread-1.jsonl",
        "--append-system-prompt",
      ]),
    );
  });
});

describe("threads list", () => {
  test("reads pi-backed sessions and surfaces summary metadata", async () => {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "sophon-cli-test-"));
    const sophonHome = path.join(tmpRoot, "home");
    const projectPath = path.join(tmpRoot, "project");
    const sessionsDir = path.join(sophonHome, "sessions");
    const metadataDir = path.join(sophonHome, "threads");
    mkdirSync(projectPath, { recursive: true });
    mkdirSync(sessionsDir, { recursive: true });
    mkdirSync(metadataDir, { recursive: true });

    const sessionFile = path.join(sessionsDir, "2026-03-10T00-00-00-000Z_thread-1.jsonl");
    writeFileSync(
      sessionFile,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "thread-1",
          timestamp: "2026-03-10T00:00:00.000Z",
          cwd: projectPath,
        }),
        JSON.stringify({
          type: "message",
          id: "m1",
          parentId: null,
          timestamp: "2026-03-10T00:00:01.000Z",
          message: {
            role: "user",
            content: "Implement Sophon on top of pi-coding-agent",
            timestamp: 1700000000000,
          },
        }),
        JSON.stringify({
          type: "message",
          id: "m2",
          parentId: "m1",
          timestamp: "2026-03-10T00:00:02.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Patched the CLI to use pi sessions." }],
            provider: "openai",
            model: "gpt-5",
            usage: {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2,
              cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
            },
            stopReason: "stop",
            timestamp: 1700000001000,
          },
        }),
        "",
      ].join("\n"),
      "utf8",
    );

    writeFileSync(
      path.join(metadataDir, "thread-1.json"),
      `${JSON.stringify(
        {
          threadId: "thread-1",
          sessionFile,
          projectPath,
          createdAt: "2026-03-10T00:00:00.000Z",
          linkedConductorSessionId: "conductor-1",
          activeSkillNames: [],
          source: "pi-coding-agent",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const cliEntryPath = fileURLToPath(new URL("./index.ts", import.meta.url));
    const result = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn("bun", [cliEntryPath, "threads", "list", "--json"], {
        cwd: projectPath,
        env: {
          ...process.env,
          SOPHON_HOME: sophonHome,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    rmSync(tmpRoot, { recursive: true, force: true });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const payload = JSON.parse(result.stdout) as Array<{
      id: string;
      title: string;
      tags: string[];
      lastMessagePreview: string | null;
    }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]?.id).toBe("thread-1");
    expect(payload[0]?.title).toContain("Implement Sophon");
    expect(payload[0]?.tags).toEqual(expect.arrayContaining(["sophon", "pi", "conductor"]));
    expect(payload[0]?.lastMessagePreview).toContain("Patched the CLI");
  });
});

describe("config set", () => {
  test("persists provider, model, and thinking level to agent settings", async () => {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "sophon-cli-config-test-"));
    const sophonHome = path.join(tmpRoot, "home");
    const cliEntryPath = fileURLToPath(new URL("./index.ts", import.meta.url));

    const setResult = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(
        "bun",
        [
          cliEntryPath,
          "config",
          "set",
          "--provider",
          "zai",
          "--model",
          "glm-4.7",
          "--thinking-level",
          "medium",
          "--json",
        ],
        {
          cwd: tmpRoot,
          env: {
            ...process.env,
            SOPHON_HOME: sophonHome,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    expect(setResult.code).toBe(0);
    expect(setResult.stderr).toBe("");

    const setPayload = JSON.parse(setResult.stdout) as {
      defaultProvider: string | null;
      defaultModel: string | null;
      defaultThinkingLevel: string | null;
    };
    expect(setPayload.defaultProvider).toBe("zai");
    expect(setPayload.defaultModel).toBe("glm-4.7");
    expect(setPayload.defaultThinkingLevel).toBe("medium");

    const agentSettings = JSON.parse(
      readFileSync(path.join(sophonHome, "agent", "settings.json"), "utf8"),
    ) as {
      defaultProvider?: string;
      defaultModel?: string;
      defaultThinkingLevel?: string;
      skills?: string[];
      enableSkillCommands?: boolean;
    };
    expect(agentSettings.defaultProvider).toBe("zai");
    expect(agentSettings.defaultModel).toBe("glm-4.7");
    expect(agentSettings.defaultThinkingLevel).toBe("medium");
    expect(agentSettings.skills).toEqual(["../skills"]);
    expect(agentSettings.enableSkillCommands).toBe(true);

    const headerExtensionSource = readFileSync(
      path.join(sophonHome, "agent", "extensions", "sophon-header.ts"),
      "utf8",
    );
    expect(headerExtensionSource).toContain("sophon");
    expect(headerExtensionSource).toContain("_____");

    const getResult = await new Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn("bun", [cliEntryPath, "config", "get", "--json"], {
        cwd: tmpRoot,
        env: {
          ...process.env,
          SOPHON_HOME: sophonHome,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    rmSync(tmpRoot, { recursive: true, force: true });

    expect(getResult.code).toBe(0);
    expect(getResult.stderr).toBe("");

    const getPayload = JSON.parse(getResult.stdout) as {
      defaultProvider: string | null;
      defaultModel: string | null;
      defaultThinkingLevel: string | null;
    };
    expect(getPayload.defaultProvider).toBe("zai");
    expect(getPayload.defaultModel).toBe("glm-4.7");
    expect(getPayload.defaultThinkingLevel).toBe("medium");
  });
});

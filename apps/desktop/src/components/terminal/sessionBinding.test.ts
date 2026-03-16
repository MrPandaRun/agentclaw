import { describe, expect, test } from "vitest";

import type { SessionLaunchTarget, TerminalSessionState } from "@/components/terminal/types";

import { rebindPendingNewThreadSession } from "./sessionBinding";

function buildResumeTarget(threadId = "thread-2"): SessionLaunchTarget {
  return {
    mode: "resume",
    key: `codex:default:${threadId}:/workspace/demo:`,
    threadId,
    providerId: "codex",
    profileName: "default",
    projectPath: "/workspace/demo",
  };
}

function buildSession(): TerminalSessionState {
  return {
    threadKey: "new:123",
    threadId: null,
    runtimeThreadId: null,
    providerId: "codex",
    sessionId: "embedded-terminal-1",
    command: "codex",
    buffer: "hello",
    bufferStartOffset: 0,
    running: true,
    hasUserInput: true,
    lastTouchedAt: 1,
  };
}

describe("rebindPendingNewThreadSession", () => {
  test("migrates the active new-thread session onto the discovered thread", () => {
    const session = buildSession();
    const sessionsByThread = new Map<string, TerminalSessionState>([["new:123", session]]);
    const sessionsById = new Map<string, TerminalSessionState>([[session.sessionId, session]]);

    const rebound = rebindPendingNewThreadSession({
      launchTarget: buildResumeTarget(),
      pendingBinding: {
        sessionKey: "new:123",
        providerId: "codex",
        profileName: "default",
        projectPath: "/workspace/demo",
        launchEnvSignature: "",
        knownThreadKeys: new Set(["codex:thread-1"]),
      },
      activeSessionId: session.sessionId,
      launchEnvSignature: "",
      sessionsByThread,
      sessionsById,
    });

    expect(rebound).toBe(true);
    expect(sessionsByThread.has("new:123")).toBe(false);
    expect(sessionsByThread.get("codex:default:thread-2:/workspace/demo:")).toBe(session);
    expect(session.threadId).toBe("thread-2");
    expect(session.runtimeThreadId).toBe("thread-2");
  });

  test("does not steal a session when the selected thread already existed", () => {
    const session = buildSession();
    const sessionsByThread = new Map<string, TerminalSessionState>([["new:123", session]]);
    const sessionsById = new Map<string, TerminalSessionState>([[session.sessionId, session]]);

    const rebound = rebindPendingNewThreadSession({
      launchTarget: buildResumeTarget("thread-1"),
      pendingBinding: {
        sessionKey: "new:123",
        providerId: "codex",
        profileName: "default",
        projectPath: "/workspace/demo",
        launchEnvSignature: "",
        knownThreadKeys: new Set(["codex:thread-1"]),
      },
      activeSessionId: session.sessionId,
      launchEnvSignature: "",
      sessionsByThread,
      sessionsById,
    });

    expect(rebound).toBe(false);
    expect(sessionsByThread.get("new:123")).toBe(session);
    expect(session.threadId).toBeNull();
  });
});

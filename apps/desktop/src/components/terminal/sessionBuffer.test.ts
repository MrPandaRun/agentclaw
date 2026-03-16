import { describe, expect, test } from "vitest";

import {
  appendToSessionBuffer,
  captureSessionBufferSnapshot,
  readSessionBufferDelta,
} from "./sessionBuffer";
import type { TerminalSessionState } from "./types";

function buildSession(): TerminalSessionState {
  return {
    threadKey: "codex:thread-1",
    threadId: "thread-1",
    runtimeThreadId: "thread-1",
    providerId: "codex",
    sessionId: "embedded-terminal-1",
    command: "codex resume thread-1",
    buffer: "",
    bufferStartOffset: 0,
    running: true,
    hasUserInput: false,
    lastTouchedAt: 0,
  };
}

describe("sessionBuffer", () => {
  test("captures a snapshot and reads only the later delta", () => {
    const session = buildSession();
    appendToSessionBuffer(session, "hello", 32);
    const snapshot = captureSessionBufferSnapshot(session);

    appendToSessionBuffer(session, " world", 32);

    expect(snapshot).toEqual({
      text: "hello",
      endOffset: 5,
    });
    expect(readSessionBufferDelta(session, snapshot.endOffset)).toEqual({
      text: " world",
      endOffset: 11,
    });
  });

  test("keeps delta slicing stable after the front of the buffer is trimmed", () => {
    const session = buildSession();
    appendToSessionBuffer(session, "abcdef", 6);
    const snapshot = captureSessionBufferSnapshot(session);

    appendToSessionBuffer(session, "ghij", 6);

    expect(session.buffer).toBe("efghij");
    expect(session.bufferStartOffset).toBe(4);
    expect(readSessionBufferDelta(session, snapshot.endOffset)).toEqual({
      text: "ghij",
      endOffset: 10,
    });
  });

  test("returns the retained tail when newer output overflowed the local buffer", () => {
    const session = buildSession();
    appendToSessionBuffer(session, "123456", 6);
    const snapshot = captureSessionBufferSnapshot(session);

    appendToSessionBuffer(session, "abcdefghi", 6);

    expect(session.buffer).toBe("defghi");
    expect(session.bufferStartOffset).toBe(9);
    expect(readSessionBufferDelta(session, snapshot.endOffset)).toEqual({
      text: "defghi",
      endOffset: 15,
    });
  });
});

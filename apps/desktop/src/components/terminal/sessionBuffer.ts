import type { TerminalSessionState } from "./types";

export interface SessionBufferSnapshot {
  text: string;
  endOffset: number;
}

export interface SessionBufferDelta {
  text: string;
  endOffset: number;
}

export function appendToSessionBuffer(
  session: TerminalSessionState,
  chunk: string,
  maxChars: number,
) {
  if (!chunk) {
    return;
  }

  session.lastTouchedAt = Date.now();
  session.buffer += chunk;

  if (session.buffer.length <= maxChars) {
    return;
  }

  const overflow = session.buffer.length - maxChars;
  session.buffer = session.buffer.slice(overflow);
  session.bufferStartOffset += overflow;
}

export function captureSessionBufferSnapshot(
  session: TerminalSessionState,
): SessionBufferSnapshot {
  return {
    text: session.buffer,
    endOffset: session.bufferStartOffset + session.buffer.length,
  };
}

export function readSessionBufferDelta(
  session: TerminalSessionState,
  startOffset: number,
): SessionBufferDelta {
  const bufferEndOffset = session.bufferStartOffset + session.buffer.length;
  if (startOffset >= bufferEndOffset) {
    return {
      text: "",
      endOffset: bufferEndOffset,
    };
  }

  const relativeStart = Math.max(0, startOffset - session.bufferStartOffset);
  return {
    text: session.buffer.slice(relativeStart),
    endOffset: bufferEndOffset,
  };
}

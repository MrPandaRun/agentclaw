import { invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect } from "react";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

import type { TerminalTheme } from "@/types";

import {
  captureSessionBufferSnapshot,
  readSessionBufferDelta,
  type SessionBufferSnapshot,
} from "./sessionBuffer";
import type {
  EmbeddedTerminalLaunchSettledPayload,
  SessionLaunchTarget,
  StartEmbeddedTerminalResponse,
  TerminalSessionState,
} from "./types";

const SNAPSHOT_WRITE_CHUNK_SIZE = 16_384;

interface UseTerminalSessionLifecycleProps {
  closeSessionById: (sessionId: string) => Promise<void>;
  cleanupDormantSessions: (activeThreadKey: string | null) => void;
  fitAddonRef: MutableRefObject<FitAddon | null>;
  launchTarget: SessionLaunchTarget | null;
  onError?: (message: string | null) => void;
  onLaunchRequestSettled?: (payload: EmbeddedTerminalLaunchSettledPayload) => void;
  queueRemoteResize: (cols: number, rows: number) => void;
  refreshRequestId: number;
  sessionIdRef: MutableRefObject<string | null>;
  sessionsByThreadRef: MutableRefObject<Map<string, TerminalSessionState>>;
  sessionsByIdRef: MutableRefObject<Map<string, TerminalSessionState>>;
  setIsRefreshing: Dispatch<SetStateAction<boolean>>;
  setIsSwitchingThread: Dispatch<SetStateAction<boolean>>;
  setLastCommand: Dispatch<SetStateAction<string | null>>;
  setRefreshError: Dispatch<SetStateAction<string | null>>;
  setStarting: Dispatch<SetStateAction<boolean>>;
  terminalRef: MutableRefObject<Terminal | null>;
  terminalTheme: TerminalTheme;
  lastHandledRefreshRequestRef: MutableRefObject<number>;
}

function mergeLaunchEnvs(
  launchEnv?: Record<string, string>,
  ideContextEnv?: Record<string, string>,
): Record<string, string> | undefined {
  const merged = {
    ...(launchEnv ?? {}),
    ...(ideContextEnv ?? {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function focusAndSyncTerminal(
  terminal: Terminal,
  fitAddonRef: MutableRefObject<FitAddon | null>,
  queueRemoteResize: (cols: number, rows: number) => void,
) {
  terminal.focus();
  fitAddonRef.current?.fit();
  queueRemoteResize(terminal.cols, terminal.rows);
}

function writeTerminalText(
  terminal: Terminal,
  text: string,
  shouldContinue: () => boolean,
  onComplete: () => void,
) {
  if (!text) {
    onComplete();
    return;
  }

  const writeChunk = (offset: number) => {
    if (!shouldContinue()) {
      return;
    }

    if (offset >= text.length) {
      onComplete();
      return;
    }

    const nextOffset = Math.min(offset + SNAPSHOT_WRITE_CHUNK_SIZE, text.length);
    terminal.write(text.slice(offset, nextOffset), () => {
      writeChunk(nextOffset);
    });
  };

  writeChunk(0);
}

function writeBufferedSnapshot(
  terminal: Terminal,
  snapshot: SessionBufferSnapshot,
  readPendingTail: (startOffset: number) => { text: string; endOffset: number },
  shouldContinue: () => boolean,
  onComplete: () => void,
) {
  const flushPendingTail = (startOffset: number) => {
    if (!shouldContinue()) {
      return;
    }

    const pendingTail = readPendingTail(startOffset);
    if (!pendingTail.text) {
      onComplete();
      return;
    }

    writeTerminalText(terminal, pendingTail.text, shouldContinue, () => {
      flushPendingTail(pendingTail.endOffset);
    });
  };

  writeTerminalText(terminal, snapshot.text, shouldContinue, () => {
    flushPendingTail(snapshot.endOffset);
  });
}

export function useTerminalSessionLifecycle({
  closeSessionById,
  cleanupDormantSessions,
  fitAddonRef,
  launchTarget,
  onError,
  onLaunchRequestSettled,
  queueRemoteResize,
  refreshRequestId,
  sessionIdRef,
  sessionsByThreadRef,
  sessionsByIdRef,
  setIsRefreshing,
  setIsSwitchingThread,
  setLastCommand,
  setRefreshError,
  setStarting,
  terminalRef,
  terminalTheme,
  lastHandledRefreshRequestRef,
}: UseTerminalSessionLifecycleProps) {
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    const forceRestart = refreshRequestId !== lastHandledRefreshRequestRef.current;
    if (forceRestart) {
      lastHandledRefreshRequestRef.current = refreshRequestId;
    }

    if (launchTarget && !forceRestart) {
      const existing = sessionsByThreadRef.current.get(launchTarget.key);
      if (existing && sessionIdRef.current === existing.sessionId) {
        setLastCommand(existing.command);
        queueRemoteResize(terminal.cols, terminal.rows);
        cleanupDormantSessions(launchTarget.key);
        setStarting(false);
        setIsSwitchingThread(false);
        fitAddonRef.current?.fit();
        return;
      }
    }

    let cancelled = false;

    const startSession = async () => {
      let started = false;
      setIsSwitchingThread(true);
      setStarting(false);
      if (forceRestart) {
        setRefreshError(null);
      }
      onError?.(null);
      setLastCommand(null);
      sessionIdRef.current = null;

      // Reset terminal and clear all buffers before switching
      terminal.reset();
      terminal.clear();

      if (!launchTarget) {
        sessionIdRef.current = null;
        terminal.writeln("Select a thread from the left panel.");
        cleanupDormantSessions(null);
        if (forceRestart) {
          setIsRefreshing(false);
        }
        setStarting(false);
        setIsSwitchingThread(false);
        return;
      }

      if (launchTarget.mode === "resume") {
        for (const session of sessionsByIdRef.current.values()) {
          if (session.threadId !== launchTarget.threadId) {
            continue;
          }
          if (session.threadKey === launchTarget.key) {
            continue;
          }
          void closeSessionById(session.sessionId);
        }
      }

      const existing = sessionsByThreadRef.current.get(launchTarget.key);
      if (existing && !forceRestart) {
        const snapshot = captureSessionBufferSnapshot(existing);
        const shouldContinueRestoring = () =>
          !cancelled && sessionsByIdRef.current.get(existing.sessionId) === existing;

        setLastCommand(existing.command);
        writeBufferedSnapshot(
          terminal,
          snapshot,
          (startOffset) => readSessionBufferDelta(existing, startOffset),
          shouldContinueRestoring,
          () => {
            if (!shouldContinueRestoring()) {
              return;
            }
            sessionIdRef.current = existing.sessionId;
            focusAndSyncTerminal(terminal, fitAddonRef, queueRemoteResize);
            cleanupDormantSessions(launchTarget.key);
            setStarting(false);
            setIsSwitchingThread(false);
          },
        );
        return;
      }

      if (existing && forceRestart) {
        await closeSessionById(existing.sessionId);
      }

      setStarting(true);

      try {
        const mergedEnv = mergeLaunchEnvs(
          launchTarget.launchEnv,
          launchTarget.ideContextEnv,
        );
        const response =
          launchTarget.mode === "resume"
            ? await invoke<StartEmbeddedTerminalResponse>("start_embedded_terminal", {
                request: {
                  threadId: launchTarget.threadId,
                  providerId: launchTarget.providerId,
                  profileName: launchTarget.profileName,
                  env: mergedEnv,
                  projectPath: launchTarget.projectPath,
                  terminalTheme,
                  cols: Math.max(40, terminal.cols || 120),
                  rows: Math.max(12, terminal.rows || 36),
                },
              })
            : await invoke<StartEmbeddedTerminalResponse>("start_new_embedded_terminal", {
                request: {
                  providerId: launchTarget.providerId,
                  profileName: launchTarget.profileName,
                  env: mergedEnv,
                  projectPath: launchTarget.projectPath,
                  terminalTheme,
                  cols: Math.max(40, terminal.cols || 120),
                  rows: Math.max(12, terminal.rows || 36),
                },
              });

        if (cancelled) {
          await invoke("close_embedded_terminal", {
            request: {
              sessionId: response.sessionId,
            },
          });
          return;
        }

        const session: TerminalSessionState = {
          threadKey: launchTarget.key,
          threadId: launchTarget.mode === "resume" ? launchTarget.threadId : null,
          runtimeThreadId: launchTarget.mode === "resume" ? launchTarget.threadId : null,
          providerId: launchTarget.providerId,
          sessionId: response.sessionId,
          command: response.command,
          buffer: "",
          bufferStartOffset: 0,
          running: true,
          hasUserInput: false,
          lastTouchedAt: Date.now(),
        };
        started = true;
        sessionsByThreadRef.current.set(launchTarget.key, session);
        sessionsByIdRef.current.set(response.sessionId, session);
        sessionIdRef.current = response.sessionId;
        setLastCommand(response.command);
        focusAndSyncTerminal(terminal, fitAddonRef, queueRemoteResize);
        cleanupDormantSessions(launchTarget.key);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (forceRestart) {
          setRefreshError(message);
        }
        onError?.(message);
      } finally {
        if (launchTarget.mode === "new") {
          onLaunchRequestSettled?.({
            launch: {
              launchId: launchTarget.launchId,
              providerId: launchTarget.providerId,
              profileName: launchTarget.profileName,
              launchEnv: launchTarget.launchEnv,
              projectPath: launchTarget.projectPath,
              knownThreadKeys: launchTarget.knownThreadKeys,
            },
            started,
          });
        }
        if (forceRestart) {
          setIsRefreshing(false);
        }
        if (cancelled) {
          return;
        }
        setStarting(false);
        setIsSwitchingThread(false);
      }
    };

    void startSession();

    return () => {
      cancelled = true;
    };
  }, [
    closeSessionById,
    cleanupDormantSessions,
    fitAddonRef,
    lastHandledRefreshRequestRef,
    launchTarget,
    onError,
    onLaunchRequestSettled,
    queueRemoteResize,
    refreshRequestId,
    sessionIdRef,
    sessionsByIdRef,
    sessionsByThreadRef,
    setIsRefreshing,
    setIsSwitchingThread,
    setLastCommand,
    setRefreshError,
    setStarting,
    terminalRef,
  ]);
}

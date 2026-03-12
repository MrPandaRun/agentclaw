import type { SessionLaunchTarget, TerminalSessionState } from "@/components/terminal/types";

export interface PendingNewLaunchBinding {
  sessionKey: string;
  providerId: string;
  profileName: string;
  projectPath: string;
  launchEnvSignature: string;
  knownThreadKeys: Set<string>;
}

interface RebindPendingNewThreadSessionParams {
  launchTarget: SessionLaunchTarget;
  pendingBinding: PendingNewLaunchBinding | null;
  activeSessionId: string | null;
  launchEnvSignature: string;
  sessionsByThread: Map<string, TerminalSessionState>;
  sessionsById: Map<string, TerminalSessionState>;
}

export function rebindPendingNewThreadSession({
  launchTarget,
  pendingBinding,
  activeSessionId,
  launchEnvSignature,
  sessionsByThread,
  sessionsById,
}: RebindPendingNewThreadSessionParams): boolean {
  if (launchTarget.mode !== "resume" || !pendingBinding || !activeSessionId) {
    return false;
  }

  const resolvedThreadKey = `${launchTarget.providerId}:${launchTarget.threadId}`;
  if (
    pendingBinding.providerId !== launchTarget.providerId ||
    pendingBinding.profileName !== launchTarget.profileName ||
    pendingBinding.projectPath !== launchTarget.projectPath ||
    pendingBinding.launchEnvSignature !== launchEnvSignature ||
    pendingBinding.knownThreadKeys.has(resolvedThreadKey)
  ) {
    return false;
  }

  const session = sessionsByThread.get(pendingBinding.sessionKey);
  if (!session || session.sessionId !== activeSessionId) {
    return false;
  }

  sessionsByThread.delete(pendingBinding.sessionKey);
  session.threadKey = launchTarget.key;
  session.threadId = launchTarget.threadId;
  session.runtimeThreadId = launchTarget.threadId;
  session.providerId = launchTarget.providerId;
  sessionsByThread.set(launchTarget.key, session);

  const sessionById = sessionsById.get(session.sessionId);
  if (sessionById && sessionById !== session) {
    sessionById.threadKey = launchTarget.key;
    sessionById.threadId = launchTarget.threadId;
    sessionById.runtimeThreadId = launchTarget.threadId;
    sessionById.providerId = launchTarget.providerId;
  }

  return true;
}

#!/usr/bin/env bun

import { realpathSync, mkdirSync, writeFileSync } from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  main as runPiMain,
} from "@mariozechner/pi-coding-agent";
import type { SessionEntry, SessionInfo } from "@mariozechner/pi-coding-agent";

import { SOPHON_HEADER_EXTENSION_SOURCE } from "./sophonHeaderExtension";

const args = process.argv.slice(2);
const version = process.env.npm_package_version ?? "0.1.0";
const PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
const SOPHON_AGENT_DIR_ENV = "SOPHON_CODING_AGENT_DIR";
const WORKER_AGENT_IDS = ["claude_code", "codex", "opencode", "sophon"] as const;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

type WorkerAgentId = (typeof WORKER_AGENT_IDS)[number];
type SophonMode = "manual" | "automatic";
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

interface AgentSettingsRecord extends Record<string, unknown> {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: ThinkingLevel;
}

interface RuntimeStateRecord {
  agentAnswering: boolean;
  lastEventKind: string | null;
  lastEventAtMs: number | null;
  pid: number | null;
}

interface ThreadMetadataRecord {
  threadId: string;
  sessionFile: string;
  projectPath: string;
  createdAt: string;
  linkedConductorSessionId: string | null;
  activeSkillNames: string[];
  source: "pi-coding-agent";
}

interface ConductorSessionRecord {
  id: string;
  title: string;
  workspacePath: string;
  status: "idle" | "running";
  createdAt: string;
  lastActiveAt: string;
  workerAgents: WorkerAgentId[];
  linkedThreadKeys: string[];
  notes: string[];
  activeSkillKeys: string[];
  lastObjective: string | null;
}

interface SophonConfigRecord {
  agentName: string;
  defaultMode: SophonMode;
  defaultWorkerAgents: WorkerAgentId[];
  skillDirectories: string[];
}

interface SophonConfigPayload extends SophonConfigRecord {
  workspacePath: string;
  sessionDir: string;
  agentDir: string;
  defaultProvider: string | null;
  defaultModel: string | null;
  defaultThinkingLevel: ThinkingLevel | null;
}

interface SkillRecord {
  key: string;
  name: string;
  description: string;
  path: string;
  source: string;
}

interface SophonPaths {
  sophonHome: string;
  sessionsDir: string;
  threadMetadataDir: string;
  runtimeDir: string;
  workspaceRoot: string;
  workspaceSessionsDir: string;
  skillsDir: string;
  agentDir: string;
  agentExtensionsDir: string;
  agentSettingsPath: string;
  agentAppendSystemPromptPath: string;
  agentHeaderExtensionPath: string;
  configPath: string;
  settingsPath: string;
}

interface SophonContext {
  paths: SophonPaths;
  config: SophonConfigRecord;
  agentSettings: AgentSettingsRecord;
}

interface ThreadSummaryPayload {
  id: string;
  projectPath: string;
  title: string;
  tags: string[];
  lastActiveAt: string;
  lastMessagePreview: string | null;
}

interface ConductorSessionSummaryPayload {
  id: string;
  title: string;
  workspacePath: string;
  status: "idle" | "running";
  createdAt: string;
  lastActiveAt: string;
  workerAgents: WorkerAgentId[];
  linkedThreadKeys: string[];
}

interface PiLaunchThread {
  threadId: string;
  sessionFile: string;
  projectPath: string;
}

const isMainModule = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return path.resolve(entry) === fileURLToPath(import.meta.url);
})();

if (isMainModule) {
  await main();
}

export async function main(cliArgs: string[] = args): Promise<void> {
  const paths = resolveSophonPaths();
  await ensureBaseDirs(paths);
  const context = await loadContext(paths);

  if (cliArgs[0] === "--version" || cliArgs[0] === "-v") {
    process.stdout.write(`sophon ${version}\n`);
    return;
  }

  if (cliArgs[0] === "--help" || cliArgs[0] === "help") {
    printUsage();
    return;
  }

  if (cliArgs[0] === "health") {
    await handleHealthCommand(context);
    return;
  }

  if (cliArgs[0] === "threads") {
    await handleThreadsCommand(context, cliArgs.slice(1));
    return;
  }

  if (cliArgs[0] === "skills") {
    await handleSkillsCommand(context, cliArgs.slice(1));
    return;
  }

  if (cliArgs[0] === "config") {
    await handleConfigCommand(context, cliArgs.slice(1));
    return;
  }

  if (cliArgs[0] === "conductor" && cliArgs[1] === "sessions") {
    await handleConductorSessionsCommand(context, cliArgs.slice(2));
    return;
  }

  await handlePiCommand(context, cliArgs);
}

export function createConductorSession(
  workspacePath: string,
  workerAgents: WorkerAgentId[] = ["codex", "claude_code", "opencode"],
): ConductorSessionRecord {
  const now = new Date().toISOString();
  return {
    id: `conductor-${cryptoRandomId()}`,
    title: path.basename(workspacePath) || "Sophon Workspace",
    workspacePath,
    status: "idle",
    createdAt: now,
    lastActiveAt: now,
    workerAgents: uniqueWorkerAgents(workerAgents),
    linkedThreadKeys: [],
    notes: [],
    activeSkillKeys: [],
    lastObjective: null,
  };
}

export function buildPiForwardArgs(
  context: Pick<SophonContext, "config" | "paths">,
  cliArgs: string[],
  launchThread: PiLaunchThread | null,
  conductor: Pick<
    ConductorSessionRecord,
    "id" | "workspacePath" | "workerAgents" | "linkedThreadKeys" | "notes"
  > | null,
): string[] {
  let forwardedArgs = [...cliArgs];

  if (!hasOptionValue(forwardedArgs, ["--extension", "-e"], context.paths.agentHeaderExtensionPath)) {
    forwardedArgs = ["--extension", context.paths.agentHeaderExtensionPath, ...forwardedArgs];
  }

  if (!hasOption(forwardedArgs, "--session-dir") && !hasFlag(forwardedArgs, "--no-session")) {
    forwardedArgs = ["--session-dir", context.paths.sessionsDir, ...forwardedArgs];
  }

  if (
    launchThread &&
    !hasOption(forwardedArgs, "--session") &&
    !hasFlag(forwardedArgs, "--continue") &&
    !hasFlag(forwardedArgs, "-c") &&
    !hasFlag(forwardedArgs, "--resume") &&
    !hasFlag(forwardedArgs, "-r")
  ) {
    forwardedArgs = ["--session", launchThread.sessionFile, ...forwardedArgs];
  }

  if (!hasOption(forwardedArgs, "--append-system-prompt")) {
    const appendPrompt = buildLaunchAppendSystemPrompt(context, launchThread?.threadId ?? null, conductor);
    if (appendPrompt) {
      forwardedArgs = [...forwardedArgs, "--append-system-prompt", appendPrompt];
    }
  }

  return forwardedArgs;
}

export function buildLaunchAppendSystemPrompt(
  context: Pick<SophonContext, "config">,
  threadId: string | null,
  conductor: Pick<
    ConductorSessionRecord,
    "id" | "workspacePath" | "workerAgents" | "linkedThreadKeys" | "notes"
  > | null,
): string | null {
  const lines: string[] = [];

  if (threadId) {
    lines.push(`Sophon thread id: ${threadId}`);
  }

  if (conductor) {
    lines.push(`Sophon conductor session: ${conductor.id}`);
    lines.push(`Workspace path: ${conductor.workspacePath}`);
    lines.push(`Default mode: ${context.config.defaultMode}`);
    lines.push(
      `Preferred worker agents: ${
        conductor.workerAgents.length > 0 ? conductor.workerAgents.join(", ") : "none"
      }`,
    );

    if (conductor.linkedThreadKeys.length > 0) {
      lines.push(`Linked threads: ${conductor.linkedThreadKeys.join(", ")}`);
    }

    if (conductor.notes.length > 0) {
      lines.push(`Recent conductor notes: ${trimTrailingRecords(conductor.notes, 4).join(" | ")}`);
    }

    lines.push(
      "When you are working inside the Sophon workspace, treat this session as the coordination thread and keep cross-agent context explicit.",
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

async function handleHealthCommand(context: SophonContext): Promise<void> {
  const [threads, conductorSessions, skills] = await Promise.all([
    listThreadSummaries(context),
    loadConductorSessions(context),
    listSkillRecords(context, process.cwd()),
  ]);

  writeJson({
    status: "healthy",
    checkedAt: new Date().toISOString(),
    message: `Sophon is ready at ${context.paths.sophonHome} using pi-coding-agent runtime`,
    mode: context.config.defaultMode,
    workerAgents: context.config.defaultWorkerAgents,
    workspacePath: context.paths.workspaceRoot,
    sessionDir: context.paths.sessionsDir,
    agentDir: context.paths.agentDir,
    skillCount: skills.length,
    directThreadCount: threads.length,
    conductorSessionCount: conductorSessions.length,
  });
}

async function handleThreadsCommand(
  context: SophonContext,
  threadArgs: string[],
): Promise<void> {
  const subcommand = threadArgs[0];

  if (subcommand === "list" && threadArgs.includes("--json")) {
    const projectPath = readOption(threadArgs, "--project-path");
    writeJson(await listThreadSummaries(context, projectPath ?? undefined));
    return;
  }

  if (subcommand === "runtime" && threadArgs.includes("--json")) {
    const threadId = requireOption(threadArgs, "--thread-id");
    const metadata = await resolveThreadMetadata(context, threadId);
    if (!metadata) {
      printUsage(`Unknown Sophon thread: ${threadId}`);
      process.exitCode = 1;
      return;
    }
    writeJson(await getThreadRuntimeState(context, metadata.threadId));
    return;
  }

  if (subcommand === "resume") {
    const threadId = threadArgs[1];
    if (!threadId) {
      printUsage("Missing thread id for `threads resume`.");
      process.exitCode = 1;
      return;
    }

    const metadata = await resolveThreadMetadata(context, threadId);
    if (!metadata) {
      printUsage(`Unknown Sophon thread: ${threadId}`);
      process.exitCode = 1;
      return;
    }

    if (threadArgs.includes("--json")) {
      writeJson({
        threadId,
        resumed: true,
        message: metadata.linkedConductorSessionId
          ? `Linked to conductor session ${metadata.linkedConductorSessionId}`
          : null,
      });
      return;
    }

    const conductor = metadata.linkedConductorSessionId
      ? await loadConductorSession(context, metadata.linkedConductorSessionId)
      : null;
    await launchPiThread(context, metadata, conductor, []);
    return;
  }

  printUsage("Unsupported `threads` command.");
  process.exitCode = 1;
}

async function handleSkillsCommand(
  context: SophonContext,
  skillArgs: string[],
): Promise<void> {
  if (skillArgs[0] === "list" && skillArgs.includes("--json")) {
    writeJson(await listSkillRecords(context, process.cwd()));
    return;
  }

  printUsage("Unsupported `skills` command.");
  process.exitCode = 1;
}

async function handleConfigCommand(
  context: SophonContext,
  configArgs: string[],
): Promise<void> {
  const subcommand = configArgs[0];

  if (subcommand === "get" && configArgs.includes("--json")) {
    writeJson(buildConfigPayload(context));
    return;
  }

  if (subcommand === "set") {
    await handleConfigSetCommand(context, configArgs.slice(1));
    return;
  }

  printUsage("Unsupported `config` command.");
  process.exitCode = 1;
}

async function handleConfigSetCommand(
  context: SophonContext,
  configArgs: string[],
): Promise<void> {
  const agentSettings = { ...(await loadAgentSettings(context.paths)) };

  const provider = readOption(configArgs, "--provider");
  const model = readOption(configArgs, "--model");
  const thinkingLevel = readOption(configArgs, "--thinking-level");
  const clearProvider = hasFlag(configArgs, "--clear-provider");
  const clearModel = hasFlag(configArgs, "--clear-model");
  const clearThinkingLevel = hasFlag(configArgs, "--clear-thinking-level");

  if (
    provider === null &&
    model === null &&
    thinkingLevel === null &&
    !clearProvider &&
    !clearModel &&
    !clearThinkingLevel
  ) {
    printUsage(
      "No supported config values supplied. Use --provider, --model, --thinking-level, or the matching --clear-* flag.",
    );
    process.exitCode = 1;
    return;
  }

  if (provider !== null) {
    agentSettings.defaultProvider = provider;
  } else if (clearProvider) {
    delete agentSettings.defaultProvider;
  }

  if (model !== null) {
    agentSettings.defaultModel = model;
  } else if (clearModel) {
    delete agentSettings.defaultModel;
  }

  if (thinkingLevel !== null) {
    if (!isThinkingLevel(thinkingLevel)) {
      printUsage(
        `Unsupported thinking level: ${thinkingLevel}. Expected one of ${THINKING_LEVELS.join(", ")}.`,
      );
      process.exitCode = 1;
      return;
    }
    agentSettings.defaultThinkingLevel = thinkingLevel;
  } else if (clearThinkingLevel) {
    delete agentSettings.defaultThinkingLevel;
  }

  await writeJsonFile(context.paths.agentSettingsPath, agentSettings);
  const nextContext: SophonContext = {
    ...context,
    agentSettings,
  };
  const payload = buildConfigPayload(nextContext);

  if (configArgs.includes("--json")) {
    writeJson(payload);
    return;
  }

  process.stdout.write(
    [
      `Persisted Sophon model defaults to ${context.paths.agentSettingsPath}`,
      `provider=${payload.defaultProvider ?? "(unset)"}`,
      `model=${payload.defaultModel ?? "(unset)"}`,
      `thinkingLevel=${payload.defaultThinkingLevel ?? "(unset)"}`,
      "",
    ].join("\n"),
  );
}

async function handleConductorSessionsCommand(
  context: SophonContext,
  conductorArgs: string[],
): Promise<void> {
  const subcommand = conductorArgs[0];

  if (subcommand === "list" && conductorArgs.includes("--json")) {
    const sessions = await loadConductorSessions(context);
    sessions.sort((left, right) => right.lastActiveAt.localeCompare(left.lastActiveAt));
    writeJson(sessions.map(toConductorSessionSummaryPayload));
    return;
  }

  if (subcommand === "start" && conductorArgs.includes("--json")) {
    const workspacePath = requireOption(conductorArgs, "--workspace");
    const session = await ensureConductorSessionForWorkspace(context, workspacePath);
    writeJson(toConductorSessionSummaryPayload(session));
    return;
  }

  if (subcommand === "inspect" && conductorArgs.includes("--json")) {
    const sessionId = requireOption(conductorArgs, "--session-id");
    const session = await loadConductorSession(context, sessionId);
    if (!session) {
      printUsage(`Unknown conductor session: ${sessionId}`);
      process.exitCode = 1;
      return;
    }
    writeJson(session);
    return;
  }

  if (subcommand === "resume") {
    const sessionId = conductorArgs[1];
    if (!sessionId) {
      printUsage("Missing session id for `conductor sessions resume`.");
      process.exitCode = 1;
      return;
    }

    const conductor = await loadConductorSession(context, sessionId);
    if (!conductor) {
      printUsage(`Unknown conductor session: ${sessionId}`);
      process.exitCode = 1;
      return;
    }

    const metadata = await loadOrCreateWorkspaceThread(context, conductor.workspacePath, conductor);
    await launchPiThread(context, metadata, conductor, []);
    return;
  }

  printUsage("Unsupported `conductor sessions` command.");
  process.exitCode = 1;
}

async function handlePiCommand(context: SophonContext, cliArgs: string[]): Promise<void> {
  const projectPath = normalizePath(process.cwd());
  const hasExplicitSessionSelection =
    hasOption(cliArgs, "--session") ||
    hasOption(cliArgs, "--session-dir") ||
    hasFlag(cliArgs, "--continue") ||
    hasFlag(cliArgs, "-c") ||
    hasFlag(cliArgs, "--resume") ||
    hasFlag(cliArgs, "-r") ||
    hasFlag(cliArgs, "--no-session");

  if (!hasExplicitSessionSelection) {
    const conductor = isWorkspacePath(context, projectPath)
      ? await ensureConductorSessionForWorkspace(context, projectPath)
      : null;
    const metadata = await createPiBackedThread(
      context,
      projectPath,
      conductor?.id ?? null,
    );
    await launchPiThread(context, metadata, conductor, cliArgs);
    return;
  }

  const sessionPath = readOption(cliArgs, "--session");
  if (sessionPath) {
    const metadata = await resolveThreadMetadataBySessionPath(context, sessionPath);
    const conductor = metadata?.linkedConductorSessionId
      ? await loadConductorSession(context, metadata.linkedConductorSessionId)
      : null;
    await launchPiMainWithContext(
      context,
      buildPiForwardArgs(context, cliArgs, metadata, conductor),
      metadata,
      conductor,
    );
    return;
  }

  await launchPiMainWithContext(
    context,
    buildPiForwardArgs(context, cliArgs, null, null),
    null,
    null,
  );
}

async function launchPiThread(
  context: SophonContext,
  metadata: ThreadMetadataRecord,
  conductor: ConductorSessionRecord | null,
  cliArgs: string[],
): Promise<void> {
  await launchPiMainWithContext(
    context,
    buildPiForwardArgs(
      context,
      cliArgs,
      {
        threadId: metadata.threadId,
        sessionFile: metadata.sessionFile,
        projectPath: metadata.projectPath,
      },
      conductor,
    ),
    {
      threadId: metadata.threadId,
      sessionFile: metadata.sessionFile,
      projectPath: metadata.projectPath,
    },
    conductor,
  );
}

async function launchPiMainWithContext(
  context: SophonContext,
  forwardedArgs: string[],
  launchThread: PiLaunchThread | null,
  conductor: ConductorSessionRecord | null,
): Promise<void> {
  const previousAgentDir = process.env[PI_AGENT_DIR_ENV];
  const previousSophonAgentDir = process.env[SOPHON_AGENT_DIR_ENV];
  const exitCleanup = registerExitCleanup(context, launchThread, conductor);
  process.env[PI_AGENT_DIR_ENV] = context.paths.agentDir;
  process.env[SOPHON_AGENT_DIR_ENV] = context.paths.agentDir;

  if (launchThread) {
    await saveThreadRuntimeState(context, launchThread.threadId, {
      agentAnswering: true,
      lastEventKind: "session_opened",
      lastEventAtMs: Date.now(),
      pid: process.pid,
    });
  }

  if (conductor && launchThread) {
    conductor.status = "running";
    conductor.lastActiveAt = new Date().toISOString();
    conductor.linkedThreadKeys = uniqueNonEmptyStrings([
      ...conductor.linkedThreadKeys,
      threadStorageKey(launchThread.threadId),
    ]);
    await saveConductorSession(context, conductor);
  }

  try {
    await runPiMain(forwardedArgs);
  } finally {
    exitCleanup();

    if (launchThread) {
      await saveThreadRuntimeState(context, launchThread.threadId, {
        agentAnswering: false,
        lastEventKind: "session_closed",
        lastEventAtMs: Date.now(),
        pid: null,
      });
    }

    if (conductor) {
      conductor.status = "idle";
      conductor.lastActiveAt = new Date().toISOString();
      await saveConductorSession(context, conductor);
    }

    if (previousAgentDir === undefined) {
      delete process.env[PI_AGENT_DIR_ENV];
    } else {
      process.env[PI_AGENT_DIR_ENV] = previousAgentDir;
    }

    if (previousSophonAgentDir === undefined) {
      delete process.env[SOPHON_AGENT_DIR_ENV];
    } else {
      process.env[SOPHON_AGENT_DIR_ENV] = previousSophonAgentDir;
    }
  }
}

function registerExitCleanup(
  context: SophonContext,
  launchThread: PiLaunchThread | null,
  conductor: ConductorSessionRecord | null,
): () => void {
  const handler = () => {
    if (launchThread) {
      writeRuntimeStateSync(context, launchThread.threadId, {
        agentAnswering: false,
        lastEventKind: "process_exit",
        lastEventAtMs: Date.now(),
        pid: null,
      });
    }

    if (conductor) {
      writeConductorSessionSync(context, {
        ...conductor,
        status: "idle",
        lastActiveAt: new Date().toISOString(),
      });
    }
  };

  process.once("exit", handler);
  return () => {
    process.off("exit", handler);
  };
}

async function listThreadSummaries(
  context: SophonContext,
  projectPath?: string,
): Promise<ThreadSummaryPayload[]> {
  const normalizedProjectPath = projectPath ? normalizePath(projectPath) : null;
  const sessions = await listPiSessions(context);
  const payloads = await Promise.all(
    sessions.map(async (session) => {
      if (
        normalizedProjectPath &&
        !normalizePath(session.cwd).startsWith(normalizedProjectPath)
      ) {
        return null;
      }
      return buildThreadSummaryPayload(context, session);
    }),
  );

  return payloads.flatMap((payload) => (payload ? [payload] : []));
}

async function buildThreadSummaryPayload(
  context: SophonContext,
  session: SessionInfo,
): Promise<ThreadSummaryPayload> {
  const metadata = await resolveThreadMetadata(context, session.id);
  const sessionManager = SessionManager.open(session.path, context.paths.sessionsDir);
  const entries = sessionManager.getEntries();
  const projectPath = normalizePath(session.cwd || metadata?.projectPath || process.cwd());
  const title =
    normalizeNonEmptyString(sessionManager.getSessionName()) ??
    summarizeTitle(session.firstMessage) ??
    path.basename(projectPath) ??
    session.id;

  return {
    id: session.id,
    projectPath,
    title,
    tags: uniqueNonEmptyStrings([
      "sophon",
      "pi",
      isWorkspacePath(context, projectPath) ? "workspace" : "manual",
      metadata?.linkedConductorSessionId ? "conductor" : "",
    ]),
    lastActiveAt: session.modified.toISOString(),
    lastMessagePreview: summarizeTitle(extractLastMessagePreview(entries) ?? session.firstMessage),
  };
}

function extractLastMessagePreview(entries: SessionEntry[]): string | null {
  let fallback: string | null = null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.type !== "message") {
      continue;
    }

    const text = extractMessageText(entry.message);
    if (!text) {
      continue;
    }

    if (entry.message.role === "assistant" || entry.message.role === "toolResult") {
      return text;
    }

    fallback ??= text;
  }

  return fallback;
}

function extractMessageText(message: unknown): string | null {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (!("content" in message)) {
    if ("command" in message && typeof message.command === "string") {
      return message.command;
    }
    return null;
  }

  const content = message.content;
  if (typeof content === "string") {
    return normalizeNonEmptyString(content);
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const chunks: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object" || !("type" in block)) {
      continue;
    }

    if (block.type === "text" && "text" in block && typeof block.text === "string") {
      chunks.push(block.text);
      continue;
    }

    if (block.type === "thinking" && "thinking" in block && typeof block.thinking === "string") {
      chunks.push(block.thinking);
      continue;
    }

    if (block.type === "toolCall" && "name" in block && typeof block.name === "string") {
      chunks.push(`[tool:${block.name}]`);
    }
  }

  return normalizeNonEmptyString(chunks.join(" "));
}

async function listSkillRecords(
  context: SophonContext,
  cwd: string,
): Promise<SkillRecord[]> {
  const settingsManager = SettingsManager.create(cwd, context.paths.agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: context.paths.agentDir,
    settingsManager,
    additionalSkillPaths: context.config.skillDirectories,
  });
  await resourceLoader.reload();
  const { skills } = resourceLoader.getSkills();

  return skills
    .map((skill) => ({
      key: skill.name,
      name: skill.name,
      description: skill.description,
      path: skill.filePath,
      source: skill.source,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function createPiBackedThread(
  context: SophonContext,
  projectPath: string,
  linkedConductorSessionId: string | null,
): Promise<ThreadMetadataRecord> {
  const normalizedProjectPath = normalizePath(projectPath);
  const sessionManager = SessionManager.create(normalizedProjectPath, context.paths.sessionsDir);
  const sessionFile = sessionManager.getSessionFile();
  const header = sessionManager.getHeader();

  if (!sessionFile || !header) {
    throw new Error("Failed to create Sophon pi session file");
  }

  await writeFile(sessionFile, `${JSON.stringify(header)}\n`, "utf8");

  const metadata: ThreadMetadataRecord = {
    threadId: header.id,
    sessionFile: normalizePath(sessionFile),
    projectPath: normalizedProjectPath,
    createdAt: header.timestamp,
    linkedConductorSessionId,
    activeSkillNames: [],
    source: "pi-coding-agent",
  };
  await saveThreadMetadata(context, metadata);
  return metadata;
}

async function resolveThreadMetadata(
  context: SophonContext,
  threadId: string,
): Promise<ThreadMetadataRecord | null> {
  const persisted = await loadThreadMetadata(context, threadId);
  if (persisted && (await fileExists(persisted.sessionFile))) {
    return normalizeThreadMetadata(persisted);
  }

  const session = await findPiSessionInfo(context, threadId);
  if (!session) {
    return null;
  }

  const metadata: ThreadMetadataRecord = {
    threadId: session.id,
    sessionFile: normalizePath(session.path),
    projectPath: normalizePath(session.cwd || process.cwd()),
    createdAt: session.created.toISOString(),
    linkedConductorSessionId: persisted?.linkedConductorSessionId ?? null,
    activeSkillNames: persisted?.activeSkillNames ?? [],
    source: "pi-coding-agent",
  };
  await saveThreadMetadata(context, metadata);
  return metadata;
}

async function resolveThreadMetadataBySessionPath(
  context: SophonContext,
  sessionPath: string,
): Promise<ThreadMetadataRecord | null> {
  const normalizedSessionPath = normalizePath(sessionPath);
  if (!(await fileExists(normalizedSessionPath))) {
    return null;
  }

  const sessionManager = SessionManager.open(normalizedSessionPath, context.paths.sessionsDir);
  const metadata = await resolveThreadMetadata(context, sessionManager.getSessionId());
  if (!metadata) {
    return null;
  }

  return {
    ...metadata,
    sessionFile: normalizedSessionPath,
  };
}

function normalizeThreadMetadata(metadata: ThreadMetadataRecord): ThreadMetadataRecord {
  return {
    ...metadata,
    sessionFile: normalizePath(metadata.sessionFile),
    projectPath: normalizePath(metadata.projectPath),
    linkedConductorSessionId: metadata.linkedConductorSessionId ?? null,
    activeSkillNames: uniqueNonEmptyStrings(metadata.activeSkillNames),
    source: "pi-coding-agent",
  };
}

async function loadOrCreateWorkspaceThread(
  context: SophonContext,
  workspacePath: string,
  conductor: ConductorSessionRecord,
): Promise<ThreadMetadataRecord> {
  const normalizedWorkspacePath = normalizePath(workspacePath);
  const threads = await listThreadSummaries(context, normalizedWorkspacePath);
  const existing = threads[0];

  if (existing) {
    const metadata = await resolveThreadMetadata(context, existing.id);
    if (metadata) {
      metadata.linkedConductorSessionId = conductor.id;
      await saveThreadMetadata(context, metadata);
      conductor.linkedThreadKeys = uniqueNonEmptyStrings([
        ...conductor.linkedThreadKeys,
        threadStorageKey(metadata.threadId),
      ]);
      await saveConductorSession(context, conductor);
      return metadata;
    }
  }

  const metadata = await createPiBackedThread(context, normalizedWorkspacePath, conductor.id);
  conductor.linkedThreadKeys = uniqueNonEmptyStrings([
    ...conductor.linkedThreadKeys,
    threadStorageKey(metadata.threadId),
  ]);
  await saveConductorSession(context, conductor);
  return metadata;
}

async function getThreadRuntimeState(
  context: SophonContext,
  threadId: string,
): Promise<RuntimeStateRecord> {
  const current =
    (await loadRecord<RuntimeStateRecord>(runtimeStatePath(context.paths.runtimeDir, threadId))) ??
    defaultRuntimeState();

  if (current.agentAnswering && current.pid && !isProcessAlive(current.pid)) {
    const stale = {
      ...current,
      agentAnswering: false,
      lastEventKind: "stale_runtime_cleared",
      lastEventAtMs: Date.now(),
      pid: null,
    };
    await saveThreadRuntimeState(context, threadId, stale);
    return stale;
  }

  return {
    ...defaultRuntimeState(),
    ...current,
  };
}

async function saveThreadRuntimeState(
  context: Pick<SophonContext, "paths">,
  threadId: string,
  state: RuntimeStateRecord,
): Promise<void> {
  await writeJsonFile(runtimeStatePath(context.paths.runtimeDir, threadId), state);
}

function writeRuntimeStateSync(
  context: Pick<SophonContext, "paths">,
  threadId: string,
  state: RuntimeStateRecord,
): void {
  const filePath = runtimeStatePath(context.paths.runtimeDir, threadId);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function defaultRuntimeState(): RuntimeStateRecord {
  return {
    agentAnswering: false,
    lastEventKind: null,
    lastEventAtMs: null,
    pid: null,
  };
}

async function ensureConductorSessionForWorkspace(
  context: SophonContext,
  workspacePath: string,
): Promise<ConductorSessionRecord> {
  const normalizedWorkspacePath = normalizePath(workspacePath);
  const sessions = await loadConductorSessions(context);
  const existing = sessions.find(
    (session) => normalizePath(session.workspacePath) === normalizedWorkspacePath,
  );

  const session =
    existing ??
    createConductorSession(normalizedWorkspacePath, context.config.defaultWorkerAgents);
  session.workspacePath = normalizedWorkspacePath;
  session.title = path.basename(normalizedWorkspacePath) || "Sophon Workspace";
  session.lastActiveAt = new Date().toISOString();
  await saveConductorSession(context, session);
  return session;
}

function isWorkspacePath(context: Pick<SophonContext, "paths">, candidatePath: string): boolean {
  const normalizedCandidate = normalizePath(candidatePath);
  const normalizedWorkspaceRoot = normalizePath(context.paths.workspaceRoot);
  return (
    normalizedCandidate === normalizedWorkspaceRoot ||
    normalizedCandidate.startsWith(`${normalizedWorkspaceRoot}${path.sep}`) ||
    normalizedCandidate.startsWith(`${normalizedWorkspaceRoot}/`)
  );
}

async function listPiSessions(context: Pick<SophonContext, "paths">): Promise<SessionInfo[]> {
  return SessionManager.list(context.paths.workspaceRoot, context.paths.sessionsDir);
}

async function findPiSessionInfo(
  context: Pick<SophonContext, "paths">,
  threadId: string,
): Promise<SessionInfo | null> {
  const sessions = await listPiSessions(context);
  return sessions.find((session) => session.id === threadId) ?? null;
}

async function loadThreadMetadata(
  context: Pick<SophonContext, "paths">,
  threadId: string,
): Promise<ThreadMetadataRecord | null> {
  return loadRecord<ThreadMetadataRecord>(threadMetadataPath(context.paths.threadMetadataDir, threadId));
}

async function saveThreadMetadata(
  context: Pick<SophonContext, "paths">,
  metadata: ThreadMetadataRecord,
): Promise<void> {
  await writeJsonFile(
    threadMetadataPath(context.paths.threadMetadataDir, metadata.threadId),
    normalizeThreadMetadata(metadata),
  );
}

async function loadConductorSessions(
  context: Pick<SophonContext, "paths">,
): Promise<ConductorSessionRecord[]> {
  return loadRecordsFromDir<ConductorSessionRecord>(context.paths.workspaceSessionsDir);
}

async function loadConductorSession(
  context: Pick<SophonContext, "paths">,
  sessionId: string,
): Promise<ConductorSessionRecord | null> {
  return loadRecord<ConductorSessionRecord>(
    path.join(context.paths.workspaceSessionsDir, `${sessionId}.json`),
  );
}

async function saveConductorSession(
  context: Pick<SophonContext, "paths">,
  session: ConductorSessionRecord,
): Promise<void> {
  await writeJsonFile(
    path.join(context.paths.workspaceSessionsDir, `${session.id}.json`),
    session,
  );
}

function writeConductorSessionSync(
  context: Pick<SophonContext, "paths">,
  session: ConductorSessionRecord,
): void {
  const filePath = path.join(context.paths.workspaceSessionsDir, `${session.id}.json`);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function resolveSophonHome(): string {
  const custom = process.env.SOPHON_HOME?.trim();
  if (custom) {
    return custom;
  }
  return path.join(os.homedir(), ".sophon");
}

function resolveSophonPaths(): SophonPaths {
  const sophonHome = resolveSophonHome();
  const agentDir = path.join(sophonHome, "agent");
  const agentExtensionsDir = path.join(agentDir, "extensions");
  return {
    sophonHome,
    sessionsDir: path.join(sophonHome, "sessions"),
    threadMetadataDir: path.join(sophonHome, "threads"),
    runtimeDir: path.join(sophonHome, "runtime"),
    workspaceRoot: path.join(sophonHome, "workspace"),
    workspaceSessionsDir: path.join(sophonHome, "workspace", "sessions"),
    skillsDir: path.join(sophonHome, "skills"),
    agentDir,
    agentExtensionsDir,
    agentSettingsPath: path.join(agentDir, "settings.json"),
    agentAppendSystemPromptPath: path.join(agentDir, "APPEND_SYSTEM.md"),
    agentHeaderExtensionPath: path.join(agentExtensionsDir, "sophon-header.ts"),
    configPath: path.join(sophonHome, "config.json"),
    settingsPath: path.join(sophonHome, "settings.json"),
  };
}

async function ensureBaseDirs(paths: SophonPaths): Promise<void> {
  await mkdir(paths.sessionsDir, { recursive: true });
  await mkdir(paths.threadMetadataDir, { recursive: true });
  await mkdir(paths.runtimeDir, { recursive: true });
  await mkdir(paths.workspaceRoot, { recursive: true });
  await mkdir(paths.workspaceSessionsDir, { recursive: true });
  await mkdir(paths.skillsDir, { recursive: true });
  await mkdir(paths.agentDir, { recursive: true });
  await mkdir(paths.agentExtensionsDir, { recursive: true });
  await ensureDefaultConfig(paths);
  await ensureDefaultPiSettings(paths);
  await ensureDefaultPiSystemPrompt(paths);
  await ensureDefaultSophonHeaderExtension(paths);
}

async function ensureDefaultConfig(paths: SophonPaths): Promise<void> {
  const hasConfig = await fileExists(paths.configPath);
  const hasSettings = await fileExists(paths.settingsPath);
  if (hasConfig || hasSettings) {
    return;
  }
  await writeJsonFile(paths.configPath, defaultConfig(paths.skillsDir));
}

async function ensureDefaultPiSettings(paths: SophonPaths): Promise<void> {
  if (await fileExists(paths.agentSettingsPath)) {
    return;
  }

  await writeJsonFile(paths.agentSettingsPath, {
    skills: ["../skills"],
    enableSkillCommands: true,
  });
}

async function ensureDefaultPiSystemPrompt(paths: SophonPaths): Promise<void> {
  if (await fileExists(paths.agentAppendSystemPromptPath)) {
    return;
  }

  await writeFile(
    paths.agentAppendSystemPromptPath,
    [
      "You are Sophon, the first-party AgentDock coding agent.",
      "Sophon is implemented on top of pi-mono's pi-coding-agent runtime.",
      "Use the current AGENTS.md and discovered skills whenever they materially improve the result.",
      "Keep responses concise, practical, and oriented toward shipping working code.",
    ].join("\n"),
    "utf8",
  );
}

async function ensureDefaultSophonHeaderExtension(paths: SophonPaths): Promise<void> {
  const hasExtension = await fileExists(paths.agentHeaderExtensionPath);
  if (hasExtension) {
    const currentSource = await readFile(paths.agentHeaderExtensionPath, "utf8");
    if (currentSource === SOPHON_HEADER_EXTENSION_SOURCE) {
      return;
    }
  }

  await writeFile(paths.agentHeaderExtensionPath, SOPHON_HEADER_EXTENSION_SOURCE, "utf8");
}

async function loadContext(paths: SophonPaths): Promise<SophonContext> {
  const [config, agentSettings] = await Promise.all([loadConfig(paths), loadAgentSettings(paths)]);
  return {
    paths,
    config,
    agentSettings,
  };
}

async function loadAgentSettings(paths: SophonPaths): Promise<AgentSettingsRecord> {
  const settings = await loadRecord<AgentSettingsRecord>(paths.agentSettingsPath);
  return isRecord(settings) ? settings : {};
}

async function loadConfig(paths: SophonPaths): Promise<SophonConfigRecord> {
  const fallback = defaultConfig(paths.skillsDir);
  const [configJson, settingsJson] = await Promise.all([
    loadRecord<Partial<SophonConfigRecord>>(paths.configPath),
    loadRecord<Partial<SophonConfigRecord>>(paths.settingsPath),
  ]);
  return normalizeConfig({
    ...configJson,
    ...settingsJson,
  }, fallback.skillDirectories[0]);
}

function defaultConfig(defaultSkillsDir: string): SophonConfigRecord {
  return {
    agentName: "sophon",
    defaultMode: "manual",
    defaultWorkerAgents: ["codex", "claude_code", "opencode"],
    skillDirectories: [defaultSkillsDir],
  };
}

function normalizeConfig(
  input: Partial<SophonConfigRecord>,
  defaultSkillsDir: string,
): SophonConfigRecord {
  const defaultWorkerAgents = uniqueWorkerAgents(
    Array.isArray(input.defaultWorkerAgents) ? input.defaultWorkerAgents : [],
  );
  const skillDirectories = uniqueNonEmptyStrings(
    [
      defaultSkillsDir,
      ...(Array.isArray(input.skillDirectories) ? input.skillDirectories : []),
    ].map((value) => expandHomePath(value)),
  );

  return {
    agentName: normalizeNonEmptyString(input.agentName) ?? "sophon",
    defaultMode: input.defaultMode === "automatic" ? "automatic" : "manual",
    defaultWorkerAgents:
      defaultWorkerAgents.length > 0 ? defaultWorkerAgents : ["codex", "claude_code", "opencode"],
    skillDirectories,
  };
}

function buildConfigPayload(context: SophonContext): SophonConfigPayload {
  return {
    ...context.config,
    workspacePath: context.paths.workspaceRoot,
    sessionDir: context.paths.sessionsDir,
    agentDir: context.paths.agentDir,
    defaultProvider: normalizeNonEmptyString(context.agentSettings.defaultProvider) ?? null,
    defaultModel: normalizeNonEmptyString(context.agentSettings.defaultModel) ?? null,
    defaultThinkingLevel: isThinkingLevel(context.agentSettings.defaultThinkingLevel)
      ? context.agentSettings.defaultThinkingLevel
      : null,
  };
}

async function loadRecordsFromDir<T>(dir: string): Promise<T[]> {
  const entries = await safeReadDir(dir);
  const records: Array<T | null> = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => loadRecord<T>(path.join(dir, entry.name))),
  );
  return records.flatMap((record) => (record ? [record] : []));
}

async function loadRecord<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function safeReadDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runtimeStatePath(runtimeDir: string, threadId: string): string {
  return path.join(runtimeDir, `${threadId}.json`);
}

function threadMetadataPath(threadMetadataDir: string, threadId: string): string {
  return path.join(threadMetadataDir, `${threadId}.json`);
}

function readOption(source: string[], option: string): string | null {
  const index = source.indexOf(option);
  if (index < 0) {
    return null;
  }
  return source[index + 1] ?? null;
}

function requireOption(source: string[], option: string): string {
  const value = readOption(source, option);
  if (value) {
    return value;
  }
  printUsage(`Missing required option: ${option}`);
  process.exit(1);
}

function hasOption(source: string[], option: string): boolean {
  return source.includes(option);
}

function hasOptionValue(source: string[], options: string[], expectedValue: string): boolean {
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    if (!current || !options.includes(current)) {
      continue;
    }
    if (source[index + 1] === expectedValue) {
      return true;
    }
  }
  return false;
}

function hasFlag(source: string[], flag: string): boolean {
  return source.includes(flag);
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsage(problem?: string): void {
  if (problem) {
    process.stderr.write(`${problem}\n`);
  }
  process.stderr.write(
    [
      "Usage:",
      "  sophon",
      "  sophon -p \"summarize the current repository state\"",
      "  sophon health --json",
      "  sophon threads list --json [--project-path <path>]",
      "  sophon threads runtime --thread-id <id> --json",
      "  sophon threads resume <id> [--json]",
      "  sophon skills list --json",
      "  sophon config get --json",
      "  sophon config set --provider <provider> --model <model> [--thinking-level <level>] [--json]",
      "  sophon conductor sessions list --json",
      "  sophon conductor sessions start --workspace <path> --json",
      "  sophon conductor sessions inspect --session-id <id> --json",
      "  sophon conductor sessions resume <id>",
      "",
      "Notes:",
      "  Other pi-coding-agent flags are forwarded through Sophon.",
      "  Sophon pins pi's agent directory to ~/.sophon/agent and session storage to ~/.sophon/sessions",
      "  unless --no-session or --session-dir is provided explicitly.",
      "",
    ].join("\n"),
  );
}

function normalizePath(input: string): string {
  const resolved = path.resolve(expandHomePath(input.trim()));
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function expandHomePath(input: string): string {
  if (!input) {
    return input;
  }
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function normalizeNonEmptyString(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function uniqueNonEmptyStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function uniqueWorkerAgents(values: readonly unknown[]): WorkerAgentId[] {
  const result: WorkerAgentId[] = [];
  const seen = new Set<WorkerAgentId>();

  for (const value of values) {
    if (!isWorkerAgentId(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function isWorkerAgentId(value: unknown): value is WorkerAgentId {
  return typeof value === "string" && WORKER_AGENT_IDS.includes(value as WorkerAgentId);
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel);
}

function summarizeTitle(input: string | null | undefined): string | null {
  const normalized = normalizeNonEmptyString(input);
  if (!normalized) {
    return null;
  }
  if (normalized.length <= 72) {
    return normalized;
  }
  return `${normalized.slice(0, 69)}...`;
}

function trimTrailingRecords(values: string[], limit: number): string[] {
  if (values.length <= limit) {
    return values;
  }
  return values.slice(values.length - limit);
}

function threadStorageKey(threadId: string): string {
  return `sophon:${threadId}`;
}

function toConductorSessionSummaryPayload(
  session: ConductorSessionRecord,
): ConductorSessionSummaryPayload {
  return {
    id: session.id,
    title: session.title,
    workspacePath: session.workspacePath,
    status: session.status,
    createdAt: session.createdAt,
    lastActiveAt: session.lastActiveAt,
    workerAgents: session.workerAgents,
    linkedThreadKeys: session.linkedThreadKeys,
  };
}

function cryptoRandomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

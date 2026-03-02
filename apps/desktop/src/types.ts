export interface AgentThreadSummary {
  id: string;
  providerId: "claude_code" | string;
  projectPath: string;
  title: string;
  tags: string[];
  lastActiveAt: string;
  lastMessagePreview?: string | null;
}

export interface ProviderInstallStatus {
  providerId: ThreadProviderId;
  installed: boolean;
  healthStatus: "healthy" | "degraded" | "offline" | string;
  message?: string | null;
}

export type AgentSupplierKind = "official" | "custom";

export interface AgentSupplier {
  id: string;
  kind: AgentSupplierKind;
  name: string;
  note?: string;
  profileName: string;
  baseUrl?: string;
  apiKey?: string;
  configJson?: string;
  updatedAt: number;
}

export type ProviderProfileMap = Record<ThreadProviderId, string>;

export interface ActiveAgentProfileSelection {
  activeProviderId: ThreadProviderId;
  profiles: ProviderProfileMap;
}

export type AgentSupplierMap = Record<ThreadProviderId, AgentSupplier[]>;

export interface AgentRuntimeSettings {
  activeProviderId: ThreadProviderId;
  activeSupplierIds: Record<ThreadProviderId, string>;
  suppliersByProvider: AgentSupplierMap;
}

export type ThreadProviderId = "claude_code" | "codex" | "opencode";
export type AppTheme = "light" | "dark" | "system";
export type TerminalTheme = "dark" | "light";

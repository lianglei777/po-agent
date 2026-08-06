import type {
  GenerationCapability,
  GenerationInput,
  GenerationInputSchema,
  JsonValue,
  GenerationRunStatus,
  GenerationSource,
  ProviderJobStatus,
} from "@/contracts/generation";

export type {
  GenerationAssetRef,
  GenerationCapability,
  GenerationInput,
  GenerationInputAsset,
  GenerationRunStatus,
  GenerationSource,
  ProviderJobStatus,
} from "@/contracts/generation";

export type GenerationArtifactKind = "image" | "video" | "audio" | "text";

export interface GenerationSession {
  id: string;
  cwd: string;
  title?: string;
  origin: "chat" | "direct-generation" | "imported";
  agentSessionRef?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface GenerationRoute {
  id: string;
  name: string;
  capability: GenerationCapability;
  providerId: string;
  providerOperation: string;
  enabled: boolean;
  isDefault: boolean;
  revision: number;
  defaults: Record<string, JsonValue>;
  inputSchema: GenerationInputSchema;
  adapterConfig: JsonValue;
  credentialRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationRun {
  id: string;
  sessionId: string;
  capability: GenerationCapability;
  routeId: string;
  parentRunId?: string;
  status: GenerationRunStatus;
  prompt: string;
  input: GenerationInput;
  source: GenerationSource;
  sourceRef?: string;
  idempotencyKey: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProviderJob {
  id: string;
  runId: string;
  attempt: number;
  providerId: string;
  providerOperation: string;
  routeRevision: number;
  resolvedConfigSnapshot: JsonValue;
  credentialRef?: string;
  retryKey?: string;
  preparedAssets?: PreparedGenerationAsset[];
  status: ProviderJobStatus;
  remoteTaskId?: string;
  remoteStatus?: string;
  nextPollAt?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreparedGenerationAsset {
  slot: string;
  name: string;
  mimeType: string;
  url: string;
}

export interface GenerationArtifact {
  id: string;
  runId: string;
  jobId: string;
  kind: GenerationArtifactKind;
  localPath?: string;
  remoteUrl?: string;
  contentType?: string;
  sizeBytes?: number;
  checksum?: string;
  text?: string;
  createdAt: string;
}

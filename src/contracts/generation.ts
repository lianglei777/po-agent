import type { JsonValue } from "./content-generation";

export const GENERATION_CAPABILITIES = [
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "multimodal-to-video",
] as const;

export type GenerationCapability = (typeof GENERATION_CAPABILITIES)[number];

export type GenerationRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export type ProviderJobStatus =
  | "created"
  | "uploading"
  | "submitting"
  | "submitted"
  | "polling"
  | "downloading"
  | "succeeded"
  | "failed"
  | "submission_unknown"
  | "cancelled";

export type GenerationSource = "agent-tool" | "direct-ui" | "api";

export type GenerationAssetRef =
  | { type: "artifact"; artifactId: string }
  | { type: "workspace-file"; relativePath: string };

export interface GenerationInputAsset {
  slot: string;
  ref: GenerationAssetRef;
}

export interface GenerationInput {
  prompt: string;
  assets?: GenerationInputAsset[];
  parameters?: Record<string, JsonValue>;
}

export interface CreateGenerationRunRequest {
  capability: GenerationCapability;
  routeId?: string;
  parentRunId?: string;
  prompt: string;
  assets?: GenerationInputAsset[];
  parameters?: Record<string, JsonValue>;
  source?: "direct-ui" | "api";
  sourceRef?: string;
  idempotencyKey: string;
}

export interface GenerationRunDto {
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
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ProviderJobDto {
  id: string;
  runId: string;
  attempt: number;
  providerId: string;
  providerOperation: string;
  status: ProviderJobStatus;
  remoteTaskId?: string;
  remoteStatus?: string;
  nextPollAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationArtifactDto {
  id: string;
  runId: string;
  jobId: string;
  kind: "image" | "video" | "audio" | "text";
  localPath?: string;
  remoteUrl?: string;
  contentType?: string;
  sizeBytes?: number;
  checksum?: string;
  text?: string;
  createdAt: string;
}

export interface GenerationToolDetails {
  runId: string;
  status: GenerationRunStatus;
  artifacts: GenerationArtifactDto[];
  error?: {
    code: string;
    message: string;
  };
}

export interface GenerationRunViewDto {
  run: GenerationRunDto;
  jobs: ProviderJobDto[];
  artifacts: GenerationArtifactDto[];
}

export interface CreateGenerationRunResponse extends GenerationRunViewDto {
  created: boolean;
}

export type ListGenerationRunsResponse = GenerationRunViewDto[];
export type GetGenerationRunResponse = GenerationRunViewDto;

export interface GenerationCredentialStatusResponse {
  hasCredential: boolean;
}

export interface SaveGenerationCredentialRequest {
  apiKey: string;
}

export interface GenerationRouteDto {
  id: string;
  name: string;
  capability: GenerationCapability;
  providerId: string;
  enabled: boolean;
  isDefault: boolean;
  revision: number;
  defaults: Record<string, JsonValue>;
}

export type ListGenerationRoutesResponse = GenerationRouteDto[];

export interface GenerationAssetUploadResponse {
  name: string;
  contentType: string;
  sizeBytes: number;
  ref: Extract<GenerationAssetRef, { type: "workspace-file" }>;
}

export interface RetryGenerationRunRequest {
  idempotencyKey: string;
}

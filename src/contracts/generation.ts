export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type GenerationParameterType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multi-select";

export interface GenerationParameterOption {
  label: string;
  value: string | number | boolean;
}

export interface GenerationParameterField {
  key: string;
  label: string;
  description?: string;
  type: GenerationParameterType;
  required?: boolean;
  defaultValue?: JsonValue;
  options?: GenerationParameterOption[];
  min?: number;
  max?: number;
}

export interface GenerationAssetSlot {
  key: string;
  label: string;
  description?: string;
  mediaType: "image" | "video" | "audio";
  required?: boolean;
  multiple?: boolean;
  minFiles?: number;
  maxFiles?: number;
  maxFileSizeBytes?: number;
  acceptedTypes?: string[];
}

export interface GenerationInputSchema {
  prompt: {
    required: boolean;
    maxLength?: number;
  };
  parameters?: GenerationParameterField[];
  assets?: GenerationAssetSlot[];
}

export const GENERATION_CAPABILITIES = [
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
  "multimodal-to-video",
] as const;

export type GenerationCapability = (typeof GENERATION_CAPABILITIES)[number];

export type GenerationRunStatus =
  | "awaiting_confirmation"
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
  providerId?: string;
  providerTaskId?: string;
  status: GenerationRunStatus;
  phase:
    | "awaiting_confirmation"
    | "queued"
    | "preparing"
    | "submitting"
    | "generating"
    | "downloading"
    | "completed"
    | "failed"
    | "cancelled";
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  waitTimedOut?: boolean;
  artifacts: GenerationArtifactDto[];
  review?: {
    route: GenerationRouteDto;
    input: GenerationInput;
  };
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

export interface GenerationProviderSettingsDto {
  providerId: string;
  enabled: boolean;
}

export interface UpdateGenerationEnabledRequest {
  enabled: boolean;
}

export interface SaveGenerationCredentialRequest {
  apiKey: string;
}

export interface GenerationRouteDto {
  id: string;
  name: string;
  capability: GenerationCapability;
  product: string;
  providerId: string;
  enabled: boolean;
  isDefault: boolean;
  revision: number;
  defaults: Record<string, JsonValue>;
  inputSchema: GenerationInputSchema;
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

export interface ConfirmGenerationRunRequest {
  prompt: string;
  parameters?: Record<string, JsonValue>;
}

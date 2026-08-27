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
  minLength?: number;
  maxLength?: number;
  format?: "url";
}

export type GenerationInputConstraint =
  | {
      kind: "at-least-one-asset";
      slots: string[];
      minFiles?: number;
    }
  | {
      kind: "mutually-exclusive-parameters";
      keys: string[];
    };

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
    minLength?: number;
    maxLength?: number;
  };
  parameters?: GenerationParameterField[];
  assets?: GenerationAssetSlot[];
  constraints?: GenerationInputConstraint[];
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

export type GenerationSource =
  | "agent-tool"
  | "chat-workflow"
  | "direct-ui"
  | "api";

export type GenerationAssetRef =
  | { type: "artifact"; artifactId: string }
  | { type: "workspace-file"; relativePath: string };

export interface GenerationInputAsset {
  slot: string;
  /** 将提示词中的语义引用与上传结果稳定关联，不能依赖异步完成顺序。 */
  bindingId?: string;
  order?: number;
  ref: GenerationAssetRef;
}

export interface GenerationInput {
  prompt: string;
  /** 用户在 Chat 中提交的原始文字；prompt 可以是结合上下文后的有效生成提示词。 */
  originalPrompt?: string;
  assets?: GenerationInputAsset[];
  parameters?: Record<string, JsonValue>;
}

export interface CreateGenerationRunRequest {
  capability: GenerationCapability;
  routeId?: string;
  parentRunId?: string;
  prompt: string;
  originalPrompt?: string;
  assets?: GenerationInputAsset[];
  parameters?: Record<string, JsonValue>;
  source?: "direct-ui" | "api";
  sourceRef?: string;
  idempotencyKey: string;
  reviewFirst?: boolean;
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
  requestSnapshot?: JsonValue;
  responseSnapshot?: JsonValue;
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
  routeId?: string;
  providerId?: string;
  providerOperation?: string;
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
  input?: GenerationInput;
  requestSnapshot?: JsonValue;
  responseSnapshot?: JsonValue;
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

export interface GenerationProviderDescriptorDto
  extends GenerationProviderSettingsDto {
  displayName: string;
  credential?: {
    kind: "api-key";
    hasCredential: boolean;
    environmentVariable: string;
  };
}

export type ListGenerationProvidersResponse = GenerationProviderDescriptorDto[];

export interface UpdateGenerationEnabledRequest {
  enabled: boolean;
}

export interface UpdateGenerationRouteRequest {
  enabled?: boolean;
  isDefault?: boolean;
}

export interface SaveGenerationCredentialRequest {
  apiKey: string;
}

export interface GenerationRouteDto {
  id: string;
  name: string;
  description: string;
  tags: string[];
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

export interface GenerationComposerOptionsResponse {
  routes: GenerationRouteDto[];
}

export type ComposerGenerationMode =
  | { type: "chat" }
  | { type: "generation-auto" }
  | { type: "generation-route"; routeId: string };

export type GenerationExecutionPolicy = "direct" | "review-first";

export interface PlanGenerationTurnRequest {
  message: string;
  sessionId?: string;
  model: {
    provider: string;
    modelId: string;
  };
  mode:
    | { type: "generation-auto" }
    | { type: "generation-route"; routeId: string };
  assets: Array<{ mediaType: "image" | "video" | "audio"; mimeType: string }>;
}

export type PlanGenerationTurnResponse =
  | { type: "chat" }
  | { type: "attachment-understanding" }
  | {
      type: "generation";
      route: GenerationRouteDto;
      effectivePrompt: string;
      parameters: Record<string, JsonValue>;
    }
  | {
      type: "clarification";
      reason:
        | "AMBIGUOUS_INTENT"
        | "GENERATION_ROUTE_MISMATCH"
        | "MODEL_ATTACHMENT_UNSUPPORTED";
      question?: string;
      suggestedRoute?: GenerationRouteDto;
    }
  | { type: "invalid"; message: string };

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

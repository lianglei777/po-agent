export const CONTENT_GENERATION_CAPABILITIES = [
  "text-to-image",
  "text-to-video",
  "image-to-image",
  "image-to-video",
  "multimodal-to-video",
] as const;

export type ContentGenerationCapability =
  (typeof CONTENT_GENERATION_CAPABILITIES)[number];

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ContentGenerationParameterType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "multi-select";

export interface ContentGenerationParameterOption {
  label: string;
  value: string | number | boolean;
}

export interface ContentGenerationParameterField {
  key: string;
  label: string;
  description?: string;
  type: ContentGenerationParameterType;
  required?: boolean;
  advanced?: boolean;
  defaultValue?: JsonValue;
  options?: ContentGenerationParameterOption[];
  min?: number;
  max?: number;
}

export interface ContentGenerationAssetSlot {
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

export interface ContentGenerationInputSchema {
  prompt: {
    required: boolean;
    maxLength?: number;
  };
  parameters?: ContentGenerationParameterField[];
  assets?: ContentGenerationAssetSlot[];
}

export interface HttpRequestTemplate {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  bodyTemplate?: JsonValue;
}

export interface ContentUploadConfig {
  url: string;
  headers?: Record<string, string>;
  fileField: string;
  urlPath: string;
  successPath?: string;
  successValues?: Array<string | number | boolean>;
  errorPath?: string;
  acceptedTypes?: string[];
  maxFiles?: number;
  maxFileSizeBytes?: number;
}

export interface ContentSubmitConfig extends HttpRequestTemplate {
  taskIdPath?: string;
  statusPath?: string;
  errorPath?: string;
}

export type ContentCompletionConfig =
  | { mode: "immediate" }
  | {
      mode: "polling";
      request: HttpRequestTemplate;
      statusPath: string;
      pendingValues: string[];
      successValues: string[];
      failureValues: string[];
      errorPath?: string;
      intervalMs: number;
      timeoutMs: number;
    };

export interface ContentOutputConfig {
  collectionPath: string;
  urlPath?: string;
  typePath?: string;
  textPath?: string;
  defaultMediaType: "image" | "video";
  downloadRemoteFiles: boolean;
}

export interface ContentGenerationApi {
  id: string;
  providerId: string;
  name: string;
  capability: ContentGenerationCapability;
  catalogId?: string;
  credentialMode: "inherit" | "override";
  requiresImages: boolean;
  hasApiKeyOverride: boolean;
  commonHeaders?: Record<string, string>;
  upload?: ContentUploadConfig;
  submit: ContentSubmitConfig;
  completion: ContentCompletionConfig;
  output: ContentOutputConfig;
  inputSchema?: ContentGenerationInputSchema;
}

export interface SaveContentGenerationApiRequest
  extends Omit<ContentGenerationApi, "hasApiKeyOverride"> {
  apiKey?: string;
}

export interface ContentGenerationProvider {
  id: string;
  name: string;
  type: "runninghub" | "custom";
  hasApiKey: boolean;
  commonHeaders?: Record<string, string>;
}

export interface SaveContentGenerationProviderRequest
  extends Omit<ContentGenerationProvider, "hasApiKey"> {
  apiKey?: string;
}

export type ListContentGenerationProvidersResponse = ContentGenerationProvider[];
export type SaveContentGenerationProviderResponse = ContentGenerationProvider;

export interface ContentGenerationDocumentationResponse {
  markdown: string;
}

export type ListContentGenerationApisResponse = ContentGenerationApi[];
export type SaveContentGenerationApiResponse = ContentGenerationApi;

export interface CreateContentGenerationSessionRequest {
  cwd: string;
  apiId: string;
}

export interface ContentGenerationSession {
  id: string;
  cwd: string;
  apiId: string;
  apiName: string;
  name?: string;
  created: string;
  modified: string;
}

export type CreateContentGenerationSessionResponse = ContentGenerationSession;

export type ContentGenerationJobPhase =
  | "created"
  | "uploading"
  | "submitting"
  | "queued"
  | "running"
  | "downloading"
  | "succeeded"
  | "failed";

export interface ContentGenerationOutput {
  localPath?: string;
  remoteUrl?: string;
  outputType?: string;
  contentType?: string;
  text?: string;
}

export interface ContentGenerationProviderResponse {
  receivedAt: string;
  body: JsonValue;
}

export interface ContentGenerationJob {
  id: string;
  sessionId: string;
  apiId: string;
  phase: ContentGenerationJobPhase;
  prompt: string;
  parameters?: Record<string, JsonValue>;
  remoteTaskId?: string;
  remoteStatus?: string;
  submitRequest?: ContentGenerationProviderResponse;
  submitResponse?: ContentGenerationProviderResponse;
  latestQueryResponse?: ContentGenerationProviderResponse;
  uploadedUrls: string[];
  uploadedAssets?: ContentGenerationUploadedAsset[];
  outputs: ContentGenerationOutput[];
  created: string;
  modified: string;
  error?: {
    stage: "upload" | "submit" | "query" | "download";
    message: string;
  };
}

export interface ContentGenerationUploadedAsset {
  slot: string;
  name: string;
  mediaType: "image" | "video" | "audio";
  url: string;
}

export type ListContentGenerationJobsResponse = ContentGenerationJob[];
export type CreateContentGenerationJobResponse = ContentGenerationJob;
export type PollContentGenerationJobResponse = ContentGenerationJob;

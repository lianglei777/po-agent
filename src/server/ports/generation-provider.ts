import type { JsonValue } from "@/contracts/generation";
import type {
  GenerationInput,
  PreparedGenerationAsset,
} from "@/server/domain/generation";

export interface ProviderInputAsset {
  slot: string;
  bindingId?: string;
  order?: number;
  name: string;
  mimeType: string;
  data: Uint8Array;
}

export interface ProviderOutput {
  url?: string;
  text?: string;
  outputType?: string;
}

export interface ProviderSubmitResult {
  state: "pending" | "succeeded" | "failed";
  remoteTaskId?: string;
  remoteStatus?: string;
  outputs: ProviderOutput[];
  errorCode?: string;
  errorMessage?: string;
  requestSnapshot?: JsonValue;
  rawSnapshot?: JsonValue;
  retryAfterMs?: number;
}

export type ProviderPollResult = ProviderSubmitResult;

export interface GenerationProvider {
  readonly providerId: string;
  prepareAssets(input: {
    operation: string;
    executionConfig: JsonValue;
    assets: ProviderInputAsset[];
    credential: string;
  }): Promise<PreparedGenerationAsset[]>;
  submit(input: {
    operation: string;
    executionConfig: JsonValue;
    generation: GenerationInput;
    assets: PreparedGenerationAsset[];
    credential: string;
  }): Promise<ProviderSubmitResult>;
  poll(input: {
    operation: string;
    executionConfig: JsonValue;
    remoteTaskId: string;
    credential: string;
  }): Promise<ProviderPollResult>;
  download(url: string): Promise<{
    data: Uint8Array;
    contentType?: string;
  }>;
  cancel?(input: {
    operation: string;
    executionConfig: JsonValue;
    remoteTaskId: string;
    credential: string;
  }): Promise<void>;
}

export interface GenerationCredentialReader {
  getCredential(reference: string): Promise<string | null>;
}

export interface GenerationCredentialStore extends GenerationCredentialReader {
  hasCredential(reference: string): Promise<boolean>;
  inspectCredential(reference: string): Promise<{
    hasCredential: boolean;
    source: "stored-file" | "environment" | "missing";
    location: string;
  }>;
  setCredential(reference: string, value: string): Promise<void>;
}

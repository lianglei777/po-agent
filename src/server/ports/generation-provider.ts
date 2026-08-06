import type { JsonValue } from "@/contracts/generation";
import type {
  GenerationInput,
  PreparedGenerationAsset,
} from "@/server/domain/generation";

export interface ProviderInputAsset {
  slot: string;
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
  rawSnapshot?: JsonValue;
}

export type ProviderPollResult = ProviderSubmitResult;

export interface GenerationProvider {
  readonly providerId: string;
  upload(input: {
    assets: ProviderInputAsset[];
    credential: string;
  }): Promise<PreparedGenerationAsset[]>;
  submit(input: {
    operation: string;
    generation: GenerationInput;
    assets: PreparedGenerationAsset[];
    credential: string;
  }): Promise<ProviderSubmitResult>;
  poll(input: {
    operation: string;
    remoteTaskId: string;
    credential: string;
  }): Promise<ProviderPollResult>;
  download(url: string): Promise<{
    data: Uint8Array;
    contentType?: string;
  }>;
  cancel?(input: {
    operation: string;
    remoteTaskId: string;
    credential: string;
  }): Promise<void>;
}

export interface GenerationCredentialStore {
  getCredential(reference: string): Promise<string | null>;
}

import type { JsonValue } from "@/contracts/generation";
import type { LipSyncFace } from "@/server/domain/pipeline";
import type { ProviderInputAsset } from "./generation-provider";

export interface LipSyncAnalysisResult {
  state: "pending" | "ready" | "failed";
  remoteTaskId?: string;
  providerSessionId?: string;
  faces?: LipSyncFace[];
  errorMessage?: string;
  rawSnapshot?: JsonValue;
}

export interface LipSyncProvider {
  submitFaceAnalysis(input: {
    video: ProviderInputAsset;
    credential: string;
  }): Promise<LipSyncAnalysisResult>;
  pollFaceAnalysis(input: {
    remoteTaskId: string;
    credential: string;
  }): Promise<LipSyncAnalysisResult>;
}

import type { CanvasAssetAnalysisContent } from "@/server/domain/pipeline";

export interface CanvasAssetAnalyzer {
  validateVisionModel(input: { provider: string; modelId: string }): Promise<void>;

  analyzeImage(input: {
    provider: string;
    modelId: string;
    name: string;
    mimeType: string;
    data: Uint8Array;
  }): Promise<CanvasAssetAnalysisContent>;

  analyzeVideoFrames(input: {
    provider: string;
    modelId: string;
    name: string;
    frames: Array<{ timestampSeconds: number; mimeType: string; data: Uint8Array }>;
  }): Promise<CanvasAssetAnalysisContent>;
}

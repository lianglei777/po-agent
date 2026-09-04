export interface CanvasMediaPreprocessor {
  sampleVideo(input: {
    name: string;
    mimeType: string;
    data: Uint8Array;
    durationSeconds?: number;
  }): Promise<{
    frames: Array<{ timestampSeconds: number; mimeType: string; data: Uint8Array }>;
    durationSeconds: number;
    analyzedDurationSeconds: number;
  }>;

  analyzeAudio(input: {
    name: string;
    mimeType: string;
    data: Uint8Array;
  }): Promise<{
    estimatedBpm: number | null;
    rhythm: "steady" | "dynamic" | "sparse";
    dynamics: "low" | "medium" | "high";
    silenceRatio: number;
    analyzedDurationSeconds: number;
  }>;
}

import type {
  ComposerGenerationMode,
  GenerationExecutionPolicy,
} from "@/contracts/generation";

export type ChatGenerationAsset = {
  id: string;
  slot: string;
  file: File;
  previewUrl?: string;
};

export type ChatGenerationState = {
  mode: ComposerGenerationMode;
  executionPolicy: GenerationExecutionPolicy;
  assets: ChatGenerationAsset[];
};

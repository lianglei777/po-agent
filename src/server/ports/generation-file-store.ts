import type { ProviderInputAsset } from "./generation-provider";
import type { BinaryFile } from "@/server/domain/workspace";

export interface GenerationFileStore {
  saveInput(input: {
    cwd: string;
    name: string;
    data: Uint8Array;
  }): Promise<string>;

  readInput(input: {
    cwd: string;
    relativePath: string;
    slot: string;
  }): Promise<ProviderInputAsset>;
  openPreview(input: { cwd: string; relativePath: string }): Promise<BinaryFile>;
  saveOutput(input: {
    cwd: string;
    runId: string;
    nameHint: string;
    index: number;
    extension?: string;
    data: Uint8Array;
  }): Promise<string>;
}

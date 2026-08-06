import type { ProviderInputAsset } from "./generation-provider";

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
  saveOutput(input: {
    cwd: string;
    runId: string;
    index: number;
    extension?: string;
    data: Uint8Array;
  }): Promise<string>;
}

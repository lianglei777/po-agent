import type {
  ContentUploadConfig,
  HttpRequestTemplate,
  JsonValue,
} from "@/contracts/content-generation";
import type { ContentGenerationInputFile } from "@/server/domain/content-generation";

export interface ContentGenerationProvider {
  upload(
    config: ContentUploadConfig,
    file: ContentGenerationInputFile,
    headers: Record<string, string>,
  ): Promise<unknown>;
  request(
    config: HttpRequestTemplate,
    headers: Record<string, string>,
    body?: JsonValue,
  ): Promise<unknown>;
  download(url: string): Promise<{
    data: Uint8Array;
    contentType?: string;
  }>;
}

export interface ContentGenerationArtifactStore {
  save(input: {
    cwd: string;
    jobId: string;
    index: number;
    extension?: string;
    data: Uint8Array;
  }): Promise<string>;
}

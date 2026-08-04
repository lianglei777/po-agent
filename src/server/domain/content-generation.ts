import type {
  ContentGenerationJob,
  ContentGenerationSession,
  SaveContentGenerationApiRequest,
} from "@/contracts/content-generation";

export interface StoredContentGenerationApi
  extends SaveContentGenerationApiRequest {
  apiKey?: string;
}

export interface ContentGenerationState {
  version: 1;
  apis: StoredContentGenerationApi[];
  sessions: ContentGenerationSession[];
  jobs: ContentGenerationJob[];
}

export interface ContentGenerationInputFile {
  name: string;
  mimeType: string;
  data: Uint8Array;
}

import type {
  ContentGenerationJob,
  SaveContentGenerationProviderRequest,
  ContentGenerationSession,
  SaveContentGenerationApiRequest,
} from "@/contracts/content-generation";

export interface StoredContentGenerationApi
  extends SaveContentGenerationApiRequest {
  apiKey?: string;
}

export interface StoredContentGenerationProvider
  extends SaveContentGenerationProviderRequest {
  apiKey?: string;
}

export interface ContentGenerationState {
  version: 2;
  providers: StoredContentGenerationProvider[];
  apis: StoredContentGenerationApi[];
  sessions: ContentGenerationSession[];
  jobs: ContentGenerationJob[];
}

export interface ContentGenerationInputFile {
  slot: string;
  name: string;
  mimeType: string;
  data: Uint8Array;
}

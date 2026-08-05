import type {
  ContentGenerationJob,
  ContentGenerationSession,
} from "@/contracts/content-generation";
import type {
  ContentGenerationState,
  StoredContentGenerationApi,
  StoredContentGenerationProvider,
} from "@/server/domain/content-generation";

export interface ContentGenerationRepository {
  read(): Promise<ContentGenerationState>;
  write(state: ContentGenerationState): Promise<void>;
  getProvider(id: string): Promise<StoredContentGenerationProvider | null>;
  getApi(id: string): Promise<StoredContentGenerationApi | null>;
  listSessions(): Promise<ContentGenerationSession[]>;
  getSession(id: string): Promise<ContentGenerationSession | null>;
  getJob(id: string): Promise<ContentGenerationJob | null>;
}

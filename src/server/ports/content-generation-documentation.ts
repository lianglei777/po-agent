export interface ContentGenerationDocumentationRepository {
  read(catalogId: string): Promise<string | null>;
}

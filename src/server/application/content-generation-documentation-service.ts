import type { ContentGenerationDocumentationResponse } from "@/contracts/content-generation";
import { AppError } from "@/server/domain/app-error";
import type { ContentGenerationDocumentationRepository } from "@/server/ports/content-generation-documentation";

export class ContentGenerationDocumentationService {
  constructor(
    private readonly documentation: ContentGenerationDocumentationRepository,
  ) {}

  async get(catalogId: string): Promise<ContentGenerationDocumentationResponse> {
    const markdown = await this.documentation.read(catalogId);
    if (!markdown) {
      throw new AppError(
        "CONTENT_DOCUMENTATION_NOT_FOUND",
        "Content generation API documentation was not found",
        404,
      );
    }
    return { markdown };
  }
}

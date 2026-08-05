import type { ContentGenerationDocumentationResponse } from "@/contracts/content-generation";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ catalogId: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<ContentGenerationDocumentationResponse>(async () => {
    const { catalogId } = await context.params;
    return container.contentGenerationDocumentationService.get(catalogId);
  });
}

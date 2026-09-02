import type { ListGenerationRunsResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<ListGenerationRunsResponse>(async () => {
    const { nodeId } = await context.params;
    const views = await container.canvasStudioService.listNodeGenerationRuns(nodeId);
    return views.map(generationRunViewDto);
  });
}

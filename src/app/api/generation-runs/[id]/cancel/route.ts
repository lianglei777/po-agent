import type { GetGenerationRunResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<GetGenerationRunResponse>(async () => {
    const { id } = await context.params;
    return generationRunViewDto(await container.generationRunService.cancelRun(id));
  });
}

import type { GetGenerationRunResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return handleRoute<GetGenerationRunResponse>(async () => {
    const { id } = await context.params;
    return generationRunViewDto(await container.generationRunService.cancelRun(id));
  });
}

import type { StageStatusesResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<StageStatusesResponse>(async () => {
    const { id } = await context.params;
    const stages = await container.pipelineRepository.getStageStatuses(id);
    return { stages };
  });
}

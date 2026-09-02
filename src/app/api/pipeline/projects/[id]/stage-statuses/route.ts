import type { StageStatusesResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<StageStatusesResponse>(async () => {
    const { id } = await context.params;
    const stages = await container.pipelineRepository.getStageStatuses(id);
    return { stages };
  });
}

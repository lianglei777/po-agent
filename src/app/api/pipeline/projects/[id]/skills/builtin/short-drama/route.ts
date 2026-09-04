import type { PipelineSkillMutationResponse } from "@/contracts/pipeline-agent";
import { protectedRoute } from "@/app/api/_route";
import { container } from "@/server/composition/container";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<PipelineSkillMutationResponse>(async () =>
    container.pipelineSkillService.installShortDrama((await context.params).id));
}

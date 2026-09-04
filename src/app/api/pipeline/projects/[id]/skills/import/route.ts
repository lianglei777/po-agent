import type { PipelineSkillMutationResponse } from "@/contracts/pipeline-agent";
import { protectedRoute, readJson } from "@/app/api/_route";
import { container } from "@/server/composition/container";
import { parseImportPipelineSkillRequest } from "@/server/transport/http/pipeline-agent-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return protectedRoute<PipelineSkillMutationResponse>(async () =>
    container.pipelineSkillService.importLocal((await context.params).id, parseImportPipelineSkillRequest(await readJson(request))));
}

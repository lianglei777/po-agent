import type { PipelineSkillLoadResponse, PipelineSkillMutationResponse } from "@/contracts/pipeline-agent";
import { protectedRoute, readJson } from "@/app/api/_route";
import { container } from "@/server/composition/container";
import { parseInstallPipelineSkillRequest, parseUpdatePipelineSkillRequest } from "@/server/transport/http/pipeline-agent-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<PipelineSkillLoadResponse>(async () =>
    container.pipelineSkillService.load((await context.params).id));
}

export async function PATCH(request: Request, context: Context) {
  return protectedRoute<PipelineSkillMutationResponse>(async () =>
    container.pipelineSkillService.update((await context.params).id, parseUpdatePipelineSkillRequest(await readJson(request))));
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<PipelineSkillMutationResponse>(async () =>
    container.pipelineSkillService.install((await context.params).id, parseInstallPipelineSkillRequest(await readJson(request))));
}

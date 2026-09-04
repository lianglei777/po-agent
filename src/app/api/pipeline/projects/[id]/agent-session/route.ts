import type { PipelineAgentConversationResponse } from "@/contracts/pipeline-agent";
import { container } from '@/server/composition/container';
import { protectedRoute, readJson } from '@/app/api/_route';
import { parseUpdatePipelineAgentConversationRequest } from "@/server/transport/http/pipeline-agent-validators";

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<PipelineAgentConversationResponse>(async () => {
    const { id } = await context.params;
    return container.pipelineAgentConversationService.getOrCreate(id);
  });
}

export const POST = GET;

export async function PATCH(request: Request, context: Context) {
  return protectedRoute<PipelineAgentConversationResponse>(async () => {
    const { id } = await context.params;
    const patch = parseUpdatePipelineAgentConversationRequest(await readJson(request));
    return container.pipelineAgentConversationService.updateSettings(id, patch);
  });
}

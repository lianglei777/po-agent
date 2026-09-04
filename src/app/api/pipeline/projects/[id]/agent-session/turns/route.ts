import type { PipelineAgentTurnResponse } from "@/contracts/pipeline-agent";
import { protectedRoute, readJson } from "@/app/api/_route";
import { container } from "@/server/composition/container";
import { parsePipelineAgentTurnRequest } from "@/server/transport/http/pipeline-agent-validators";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return protectedRoute<PipelineAgentTurnResponse>(async () => {
    const { id } = await context.params;
    return container.pipelineAgentConversationService.submitTurn(
      id,
      parsePipelineAgentTurnRequest(await readJson(request)),
    );
  });
}

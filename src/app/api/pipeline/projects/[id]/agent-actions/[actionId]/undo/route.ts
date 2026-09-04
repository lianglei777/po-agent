import type { UndoCanvasAgentActionResponse } from "@/contracts/pipeline-agent";
import { protectedRoute } from "@/app/api/_route";
import { container } from "@/server/composition/container";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string; actionId: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<UndoCanvasAgentActionResponse>(async () => {
    const { id, actionId } = await context.params;
    const action = await container.pipelineAgentPlanService.undoFromUser(id, actionId);
    return { actionId: action.id, status: "undone" };
  });
}

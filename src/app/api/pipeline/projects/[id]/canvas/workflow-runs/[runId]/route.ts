import type { CanvasWorkflowRunResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; runId: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<CanvasWorkflowRunResponse>(async () => {
    const { id, runId } = await context.params;
    return { workflowRun: await container.canvasWorkflowRunService.get(id, runId) };
  });
}

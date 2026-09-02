import type { CanvasWorkflowRunResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; runId: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<CanvasWorkflowRunResponse>(async () => {
    const { id, runId } = await context.params;
    return { workflowRun: await container.canvasWorkflowRunService.retry(id, runId) };
  });
}

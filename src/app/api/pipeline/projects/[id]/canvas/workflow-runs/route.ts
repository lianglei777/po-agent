import type { CanvasWorkflowRunListResponse } from "@/contracts/pipeline";
import { protectedRoute } from "@/app/api/_route";
import { container } from "@/server/composition/container";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<CanvasWorkflowRunListResponse>(async () => {
    const { id } = await context.params;
    return { workflowRuns: await container.canvasStudioService.listWorkflowRuns(id) };
  });
}

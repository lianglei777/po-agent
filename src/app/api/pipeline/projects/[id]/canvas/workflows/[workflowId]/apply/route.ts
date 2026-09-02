import type { CanvasEdge, CanvasNode } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; workflowId: string }> };

export async function POST(request: Request, context: Context) {
  return protectedRoute<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>(async () => {
    const { id, workflowId } = await context.params;
    const body = (await readJson(request)) as { positionX?: number; positionY?: number };
    return container.canvasStudioService.applyWorkflow({ projectId: id, workflowId, positionX: body.positionX ?? 0, positionY: body.positionY ?? 0 });
  });
}

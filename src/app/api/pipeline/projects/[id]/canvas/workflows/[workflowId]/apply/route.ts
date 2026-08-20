import type { CanvasEdge, CanvasNode } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; workflowId: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<{ nodes: CanvasNode[]; edges: CanvasEdge[] }>(async () => {
    const { id, workflowId } = await context.params;
    const body = (await readJson(request)) as { positionX?: number; positionY?: number };
    return container.canvasStudioService.applyWorkflow({ projectId: id, workflowId, positionX: body.positionX ?? 0, positionY: body.positionY ?? 0 });
  });
}

import type { CanvasEdge } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<{ edge: CanvasEdge }>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as { sourceNodeId?: string; targetNodeId?: string };
    if (!body.sourceNodeId || !body.targetNodeId) {
      throw new AppError("VALIDATION_ERROR", "sourceNodeId and targetNodeId are required", 400);
    }
    return { edge: await container.canvasStudioService.connect({ projectId: id, sourceNodeId: body.sourceNodeId, targetNodeId: body.targetNodeId }) };
  });
}

export async function DELETE(request: Request, context: Context) {
  return handleRoute<{ success: true }>(async () => {
    const { id } = await context.params;
    const edgeId = new URL(request.url).searchParams.get("edgeId");
    if (!edgeId) throw new AppError("VALIDATION_ERROR", "edgeId query parameter is required", 400);
    await container.canvasStudioService.deleteEdge(edgeId, id);
    return { success: true as const };
  });
}

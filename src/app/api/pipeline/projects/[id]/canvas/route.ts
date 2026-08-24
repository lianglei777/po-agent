import type {
  CanvasNode,
  CanvasStateResponse,
  CreateCanvasNodeRequest,
  UpdateCanvasNodeRequest,
  UpdateCanvasViewportRequest,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<CanvasStateResponse>(async () => {
    const { id } = await context.params;
    return container.canvasStudioService.getState(id);
  });
}

export async function POST(request: Request, context: Context) {
  return handleRoute<{ node: CanvasNode }>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as CreateCanvasNodeRequest;
    if (!["text", "image", "video", "audio"].includes(body.type)) {
      throw new AppError("VALIDATION_ERROR", "Canvas node type is invalid", 400);
    }
    const node = await container.canvasStudioService.createNode({ projectId: id, ...body });
    return { node };
  });
}

export async function PATCH(request: Request, context: Context) {
  return handleRoute<{ success: true; node?: CanvasNode }>(async () => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const nodeId = url.searchParams.get("nodeId");
    const body = (await readJson(request)) as UpdateCanvasNodeRequest | UpdateCanvasViewportRequest;
    if (!nodeId) {
      const viewport = body as UpdateCanvasViewportRequest;
      await container.canvasStudioService.updateViewport(id, viewport);
      return { success: true as const };
    }
    const node = await container.canvasStudioService.updateNode(nodeId, body as UpdateCanvasNodeRequest, id);
    return { success: true as const, node };
  });
}

export async function DELETE(request: Request, context: Context) {
  return handleRoute<{ success: true }>(async () => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) throw new AppError("VALIDATION_ERROR", "nodeId query parameter is required", 400);
    await container.canvasStudioService.deleteNode(nodeId, id);
    return { success: true as const };
  });
}

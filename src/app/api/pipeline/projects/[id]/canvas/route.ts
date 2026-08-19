import type {
  CanvasStateResponse,
  UpdateNodePositionRequest,
} from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<CanvasStateResponse>(async () => {
    const { id } = await context.params;
    const [nodes, edges] = await Promise.all([
      container.pipelineRepository.listCanvasNodes(id),
      container.pipelineRepository.listCanvasEdges(id),
    ]);
    return { nodes, edges };
  });
}

export async function DELETE(request: Request, context: Context) {
  return handleRoute<{ success: true }>(async () => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) {
      throw new AppError("VALIDATION_ERROR", "nodeId query parameter is required", 400);
    }
    await container.pipelineRepository.deleteCanvasEdgesByNode(nodeId);
    await container.pipelineRepository.deleteCanvasNode(nodeId);
    return { success: true };
  });
}

export async function PATCH(request: Request, context: Context) {
  return handleRoute<{ success: true }>(async () => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) {
      throw new AppError("VALIDATION_ERROR", "nodeId query parameter is required", 400);
    }
    const body = (await readJson(request)) as UpdateNodePositionRequest;
    await container.pipelineRepository.updateCanvasNodePosition(
      nodeId,
      body.x,
      body.y,
    );
    return { success: true };
  });
}

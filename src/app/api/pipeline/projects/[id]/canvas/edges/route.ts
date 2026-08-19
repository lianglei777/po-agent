import type { CanvasEdge } from '@/contracts/pipeline';
import { container } from '@/server/composition/container';
import { AppError } from '@/server/domain/app-error';
import { handleRoute, readJson } from '@/server/transport/http/api-response';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<{ success: true; edge: CanvasEdge }>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as {
      sourceNodeId: string;
      targetNodeId: string;
      edgeType: string;
    };
    if (!body.sourceNodeId || !body.targetNodeId) {
      throw new AppError('VALIDATION_ERROR', 'sourceNodeId and targetNodeId are required', 400);
    }
    const edgeType = (body.edgeType === 'source_of' || body.edgeType === 'generates') ? body.edgeType : 'references';
    const edge = await container.pipelineRepository.createCanvasEdge({
      projectId: id,
      sourceNodeId: body.sourceNodeId,
      targetNodeId: body.targetNodeId,
      edgeType: edgeType as never,
    });
    return { success: true as const, edge };
  });
}

export async function DELETE(request: Request, context: Context) {
  return handleRoute<{ success: true }>(async () => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const edgeId = url.searchParams.get('edgeId');
    if (!edgeId) {
      throw new AppError('VALIDATION_ERROR', 'edgeId query parameter is required', 400);
    }
    await container.pipelineRepository.deleteCanvasEdge(edgeId);
    return { success: true as const };
  });
}

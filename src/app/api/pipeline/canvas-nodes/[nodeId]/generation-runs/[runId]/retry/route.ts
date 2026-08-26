import type { GenerationRunViewDto } from "@/contracts/generation";
import type { CanvasNode } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";
import { parseRetryCanvasGenerationRequest } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string; runId: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<{ node: CanvasNode; generation: GenerationRunViewDto }>(async () => {
    const [{ nodeId, runId }, input] = await Promise.all([
      context.params,
      readJson(request).then(parseRetryCanvasGenerationRequest),
    ]);
    const result = await container.canvasStudioService.retryNodeGeneration(nodeId, runId, input.idempotencyKey);
    return { node: result.node, generation: generationRunViewDto(result.view) };
  });
}

import type { GenerationRunViewDto } from "@/contracts/generation";
import type { CanvasNode } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";
import { parseRetryCanvasGenerationRequest } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string; runId: string }> };

export async function POST(request: Request, context: Context) {
  return protectedRoute<{ node: CanvasNode; generation: GenerationRunViewDto; action: "resubmit" | "redownload" }>(async () => {
    const [{ nodeId, runId }, input] = await Promise.all([
      context.params,
      readJson(request).then(parseRetryCanvasGenerationRequest),
    ]);
    const result = await container.canvasStudioService.recoverNodeGeneration(nodeId, runId, input.idempotencyKey);
    return { node: result.node, generation: generationRunViewDto(result.view), action: result.action };
  });
}

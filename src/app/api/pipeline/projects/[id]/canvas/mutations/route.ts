import type { CanvasStateResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseCanvasMutationBatch } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<CanvasStateResponse>(async () => {
    const { id } = await context.params;
    const batch = parseCanvasMutationBatch(await readJson(request));
    return container.canvasStudioService.applyMutationBatch(id, batch);
  });
}

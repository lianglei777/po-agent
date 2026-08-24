import type { GenerateCanvasNodeResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseGenerateCanvasNodeRequest } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<GenerateCanvasNodeResponse>(async () => {
    const { nodeId } = await context.params;
    const input = parseGenerateCanvasNodeRequest(await readJson(request));
    return container.canvasStudioService.generate(nodeId, input);
  });
}

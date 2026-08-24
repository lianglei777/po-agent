import type { GenerateTextNodeResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseGenerateTextNodeRequest } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<GenerateTextNodeResponse>(async () => {
    const { nodeId } = await context.params;
    const input = parseGenerateTextNodeRequest(await readJson(request));
    return { node: await container.canvasStudioService.generateText(nodeId, input) };
  });
}

import type { GenerateTextNodeResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute, readJson } from "@/app/api/_route";
import { parseGenerateTextNodeRequest } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function POST(request: Request, context: Context) {
  return protectedRoute<GenerateTextNodeResponse>(async () => {
    const { nodeId } = await context.params;
    const input = parseGenerateTextNodeRequest(await readJson(request));
    return { node: await container.canvasStudioService.generateText(nodeId, input) };
  });
}

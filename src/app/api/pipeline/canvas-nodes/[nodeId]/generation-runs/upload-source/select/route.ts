import type { CanvasNode } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function POST(_request: Request, context: Context) {
  return handleRoute<{ node: CanvasNode }>(async () => {
    const { nodeId } = await context.params;
    return { node: await container.canvasStudioService.selectNodeUploadSource(nodeId) };
  });
}

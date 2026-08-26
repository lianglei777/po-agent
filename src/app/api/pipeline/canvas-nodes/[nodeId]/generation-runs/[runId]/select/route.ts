import type { CanvasNode } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { parseSelectCanvasArtifactRequest } from "@/server/transport/http/pipeline-canvas-validators";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string; runId: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<{ node: CanvasNode }>(async () => {
    const [{ nodeId, runId }, input] = await Promise.all([
      context.params,
      readJson(request).then(parseSelectCanvasArtifactRequest),
    ]);
    const node = await container.canvasStudioService.selectNodeGenerationArtifact(nodeId, runId, input.artifactId);
    return { node };
  });
}
